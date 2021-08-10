const fs = require('fs');
const archiver = require('archiver');

const temp_dir = '.codex-data/temp-archives/';

class Archiver {
    
    constructor(server, config){
        this.server = server;
        this.config = config;
        this.module_name = "Archiver Module";
    }

    init()
    {
        var _this = this;
        this.server.express.post("/api/archive", function (req, res) {
            if(req.body == undefined) {
                console.log("> Error in /api/archive: req.body is empty");
                res.status(400).end();
                return;
            }
            console.log(req.body);
            if(req.body.paths == undefined) {
                res.status(400).end();
                return;
            }
            try {
                _this.archivePaths(req.body.paths, req.body.title, _this);    
            } catch (error) {
                console.log(error);
            }
            res.status(200).end();
        });
    }  

    run(){}

    archivePaths(paths, archive_title, _this)
    {
        var archive = _this.create_archive(archive_title);
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
                console.log(`> Warning creating archive: ${file_path} doesn\'t exist`);
            }
        }
        // finalize the archive (ie we are done appending files but streams have to finish yet)
        // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
        archive.finalize();
    }
    
    create_archive(archive_title){
        // create a file to stream archive data to.
        const output = fs.createWriteStream(process.cwd() + "/" + temp_dir + archive_title + '.zip');
        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });

        // listen for all archive data to be written
        // 'close' event is fired only when a file descriptor is involved
        output.on('close', function() {
            console.log(archive.pointer() + ' total bytes');
            console.log('archiver has been finalized and the output file descriptor has closed.');
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
            // throw error
            throw err;
        }
        });

        // good practice to catch this error explicitly
        archive.on('error', function(err) {
            throw err;
        });

        // pipe archive data to the file
        archive.pipe(output);
        
        return archive;
    }
}

module.exports = Archiver;