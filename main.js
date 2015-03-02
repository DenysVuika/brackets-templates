/*global define, $, brackets */

define(function (require, exports, module) {
  'use strict';
  
  var CommandManager = brackets.getModule('command/CommandManager'),
      Menus = brackets.getModule('command/Menus'),
      ProjectManager = brackets.getModule('project/ProjectManager'),
      DefaultDialogs = brackets.getModule('widgets/DefaultDialogs'),
      Dialogs = brackets.getModule('widgets/Dialogs'),
      NodeDomain = brackets.getModule("utils/NodeDomain"),
      ExtensionUtils = brackets.getModule("utils/ExtensionUtils");
  
  var zipUtils = new NodeDomain("zipUtils", ExtensionUtils.getModulePath(module, "node/zipUtils"));
  
  function unpackTemplate (template, projectPath, callback) {
    zipUtils
      .exec("unpack", template, projectPath)
      .done(callback)
      .fail(callback);
  }
  
  function createProjectTemplate (templateName) {
    var root = ProjectManager.getProjectRoot();
    if (root) {
      root.getContents(function (err, entries) {
        if (err) {
          Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_ERROR, "Error", err);
          return;
        }
        
        if (entries.length > 0) {
          Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_ERROR, "Error", 'Project folder must be empty.');
          return;
        }
        
        var templateUrl = require.toUrl('./templates/' + templateName);
        unpackTemplate(templateUrl, root.fullPath, function (err) {
          if (err) {
            Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_ERROR, "Error", err);
            return;
          }
          ProjectManager.refreshFileTree();
          Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, "Info", 'Project has been successfully generated.');  
        });
      });
    }
  }
  
  function getTemplateBuilder (key) {
    return function () {
      createProjectTemplate(key);
    };
  }
  
  function setupMenu() {
    var json = require('text!templates/templates.json');
    var settings = JSON.parse(json);
    var menu = Menus.addMenu("Templates", "dvuyka.templates.menu");
    
    for (var key in settings) {
      var entry = settings[key];
      var MENU_ID = "dvuyka.templates.menu." + entry.id;
      CommandManager.register(entry.name, MENU_ID, getTemplateBuilder(entry.package));
      menu.addMenuItem(MENU_ID);
    }
  }
  
  function init() {
    setupMenu();  
  }
  
  init();
});