const fs = require('fs');
const archiver = require('archiver');
const chalk = require('chalk');
var uniqid = require('uniqid');
var filesize = require('filesize');
const { Timer } = require('timer-node');

const temp_dir = '.codex-data/temp-archives/';

class Archiver {
    
    constructor(server, config){
        this.server = server;
        this.config = config;
        this.module_name = "Archiver Module";
        this.archived_files = [];
    }

    init()
    {
        var _this = this;
        this.loadSavedArchives();
        this.server.express.post("/api/archive", function (req, res) {
            if(req.body == undefined) {
                console.log("> Error in /api/archive: req.body is empty");
                res.status(400).end();
                return;
            }
            if(req.body.paths == undefined) {
                res.status(400).end();
                return;
            }
            try {
                //console.log(`> Creating archive ${chalk.green(`\'${req.body.title}.zip\'`)}`)
                var archiver = _this.archivePaths(req.body.paths, req.body.title, _this);
                archiver.promise.then((size) => {
                    var logMsg = `> Archive created for ${chalk.green(`\'${req.body.title}.zip\'`)}`;
                    logMsg += `with ${filesize(size)} in ${archiver.timer.ms()}ms (${archiver.id})`;
                    console.log(logMsg);
                    var new_route = `${archiver.id}/${req.body.title}.zip`;
                    _this.archived_files.push(new_route);
                    res.status(200).json({ archive_path: new_route }).end();
                })
                .catch((err) => {
                    console.log(err);
                    res.status(500).end();
                });    
            } catch (error) {
                console.log(error);
            }
        });
    }  

    run(){}

    getFile(path, req) {
        var _this = this;
        console.log(`> Looking for ${chalk.green(`\'${path}\'`)} in archived files`);
        return new Promise((resolve, reject) => {
            for (let i = 0; i < _this.archived_files.length; i++) {
                const file = _this.archived_files[i];
                if(path == file) {
                    var full_path = process.cwd() + "/" + temp_dir + file;
                    console.log(`> Found archived file ${chalk.green(`\'${full_path}\'`)}`);
                    resolve(full_path);
                }
            }
            resolve(undefined);
        });
    }

    loadSavedArchives(){
        var file_list = this.server.fileTools.list_folder(process.cwd() + "/" + temp_dir, true);
        for (let i = 0; i < file_list.length; i++) {
            const folder = file_list[i];
            if(folder.folder_contents != undefined){
                var saved_archived = `${folder.name}/${folder.folder_contents[0].name}`;
                this.archived_files.push(saved_archived);
            }
        }
        console.log(`> Loaded ${this.archived_files.length} saved archives`);
    }

    archivePaths(paths, archive_title, _this)
    {
        var archiver = _this.create_archive(archive_title);
        var archive = archiver.archive;
        var file_tools = _this.server.fileTools;
        for (let i = 0; i < paths.length; i++) {
            const path = paths[i];
            var file_path = process.cwd() + path;
            if(file_tools.path_exists(file_path)){
                if(file_tools.isFile(file_path)){
                    archive.file(file_path, { name: path });
                } else {
                    archive.directory(path, path);  
                }
            } else {
                console.log(`> ${chalk.yellow('Warning creating archive')}: ${file_path} doesn\'t exist`);
            }
        }
        // finalize the archive (ie we are done appending files but streams have to finish yet)
        // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
        archive.finalize();
        return archiver
    }
    
    create_archive(archive_title){
        var timer = new Timer({ label: archive_title });
        timer.start();
        // Create unique ID
        var id = uniqid();
        var unique_path = process.cwd() + "/" + temp_dir + id + "/";
        this.server.fileTools.create_path(unique_path);
        // create a file to stream archive data to.
        const output = fs.createWriteStream(unique_path + archive_title + '.zip');
        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });
        var promise = new Promise((resolve, reject) => {
            // listen for all archive data to be written
            // 'close' event is fired only when a file descriptor is involved
            output.on('close', function() {
                //console.log(archive.pointer() + ' total bytes');
                //console.log('archiver has been finalized and the output file descriptor has closed.');
                timer.stop();
                resolve(archive.pointer());
            });

            // This event is fired when the data source is drained no matter what was the data source.
            // It is not part of this library but rather from the NodeJS Stream API.
            // @see: https://nodejs.org/api/stream.html#stream_event_end
            output.on('end', function() {
                console.log('Data has been drained');
            });

            // good practice to catch warnings (ie stat failures and other non-blocking errors)
            archive.on('warning', function(err) {
                if (err.code === 'ENOENT') {
                    // log warning
                    console.log(err);
                } else {
                    console.log(err);
                    //reject();                    
                }
            });

            // good practice to catch this error explicitly
            archive.on('error', function(err) {
                console.log(err);
                timer.stop();
                reject();  
            });

            // pipe archive data to the file
            archive.pipe(output);
        });
        return { promise: promise, archive: archive, timer: timer, id: id };
    }
}

module.exports = Archiver;