(function () {
  
  var fs = require('fs'),
      os = require('os'),
      path = require('path'),
      http = require('http'),
      https = require('https'),
      url = require('url'),
      JSZip = require("./jszip");  
  
  var DOMAIN_NAME = 'zipUtils';

  function createPathSync (root, dirpath) {
    var parts = dirpath.split(path.sep);
    for( var i = 1; i <= parts.length; i++ ) {
      var p = path.join(root, path.join.apply(null, parts.slice(0, i)));
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p);
      }
    }
  }
  
  function normalizePath(target) {
    return path
        .normalize(target)
        .split(path.sep)
        .slice(1)
        .join(path.sep);
  }
  
  function getRequestOptions(targetUrl) {
    var parsedUrl = url.parse(targetUrl);
    return {
      host: parsedUrl.host,
      path: parsedUrl.path,
      //port: parsedUrl.protocol === 'https:' ? 443 : 80,
      method: 'GET',
      headers: { 'User-Agent': 'DenisVuyka/Brackets-Templates' }
    };
  }
  
  function getRequestClient(targetUrl) {
    var parsedUrl = url.parse(targetUrl);
    return parsedUrl.protocol === 'https:' ? https : http;
  }
  
  function download(targetUrl, destPath, cb) {
    /*var targetUrl = 'https://api.github.com/repos/DenisVuyka/quickstart-html5/zipball/v1.0.0';*/
    var dest = destPath || path.join(os.tmpdir(), 'brackets-templates-' + Date.now().toString()),
        options = getRequestOptions(targetUrl),
        client = getRequestClient(targetUrl);
    
    client.get(options, function (res) {
      if (res.statusCode === 302) {
        return download(res.headers.location, dest, cb);
      }

      var file = fs.createWriteStream(dest);
      var request = client.get(options, function(response) {
        response.pipe(file);
        file.on('finish', function() {
          //file.close(cb);  // close() is async, call cb after close completes.
          file.close(function () {
            return cb && cb(false, { "packagePath": dest });
          });
        });
      }).on('error', function(err) {
        fs.unlink(dest);
        return cb && cb(err.message);
      });
    });
  }
  
  function unpack(source, root, callback) {
    fs.readFile(source, function (err, data) {
      if (err) {
        return callback && callback('Error reading template file');
        //return callback && callback(err);
      }
      var zip = new JSZip(data);
      var key, entry;
      
      // Create folders
      for (key in zip.files) {
        entry = zip.files[key];
        if (entry.dir) {          
          var dir = normalizePath(entry.name);
          if (dir) {
            createPathSync(root, dir);
          }          
        }
      }
      // Create files
      for (key in zip.files) {
        entry = zip.files[key];
        if (!entry.dir) {
          var name = normalizePath(entry.name);
          if (name) {
            var content = entry.asText();
            fs.writeFileSync(path.join(root, name), content);
          }
        }
      }
      
      return callback && callback(null);
    });
  }
  
  function init(domainManager) {
    if (!domainManager.hasDomain(DOMAIN_NAME)) {
      domainManager.registerDomain(DOMAIN_NAME, {
        major: 0, 
        minor: 1
      });
    }
    
    domainManager.registerCommand(
      DOMAIN_NAME,
      "unpack",
      unpack,
      true,
      "Unpack project template to the destination directory",
      [{
        name: "source",
        type: "string",
        description: "path to the source package"
      }],
      [{
        name: "root",
        type: "string",
        description: "root directory to unpack template content to"
      }]
    );
    
    domainManager.registerCommand(
      DOMAIN_NAME,
      "download",
      download,
      true,
      "Download project template",
      [{
        name: "targetUrl",
        type: "string",
        description: "Target URL address"
      }],
      [{
        name: "destPath",
        type: "string",
        description: "Destination path (optional)"
      }]
    );
  }
  
  exports.init = init;

}());