(function () {
  
  var fs = require("fs");
  var path = require('path');
  var JSZip = require("./jszip");
  
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
  
  function unpack(source, root, callback) {
    fs.readFile(source, function (err, data) {
      if (err) {
        return callback && callback('Error reading template file');
        //return callback && callback(err);
      }
      var zip = new JSZip(data);
      
      // Create folders
      for (var key in zip.files) {
        var entry = zip.files[key];
        if (entry.dir) {          
          var dir = normalizePath(entry.name);
          if (dir) {
            createPathSync(root, dir);
          }          
        }
      }
      // Create files
      for (var key in zip.files) {
        var entry = zip.files[key];
        if (!entry.dir) {
          var name = normalizePath(entry.name);
          if (name) {
            var content = entry.asText();
            fs.writeFileSync(path.join(root, name), content);
          }
        }
      }
      
      callback && callback(null);
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
  }
  
  exports.init = init;

}());