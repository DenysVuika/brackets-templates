/*global define, $, brackets, Mustache */

define(function (require, exports, module) {
  'use strict';
  
  var CommandManager = brackets.getModule('command/CommandManager'),
      Commands = brackets.getModule('command/Commands'),
      Menus = brackets.getModule('command/Menus'),
      ProjectManager = brackets.getModule('project/ProjectManager'),
      DefaultDialogs = brackets.getModule('widgets/DefaultDialogs'),
      Dialogs = brackets.getModule('widgets/Dialogs'),
      NodeDomain = brackets.getModule("utils/NodeDomain"),
      ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
      FileSystem = brackets.getModule("filesystem/FileSystem"),
      FileUtils = brackets.getModule('file/FileUtils'),
      Strings = brackets.getModule('strings'),
      ExtensionStrings = require('strings');
  
  var NewProjectDialogTemplate = require("text!htmlContent/new-project-dialog.html");
  var zipUtils = new NodeDomain("zipUtils", ExtensionUtils.getModulePath(module, "node/zipUtils"));
  
  function unpackTemplate (template, projectPath, callback) {
    zipUtils
      .exec("unpack", template, projectPath)
      .done(callback)
      .fail(callback);
  }
  
  function generateProject (projectPath, templateName) {
    var promise = new $.Deferred();
    
    if (!projectPath || !templateName) {
      promise.reject(ExtensionStrings.ERROR_GENERATING_PROJECT);
    } else {
      var templateUrl = require.toUrl('./templates/' + templateName);
      unpackTemplate(templateUrl, projectPath, function (err) {
        if (err) {
          promise.reject(err);
        } else {
          promise.resolve(true);
        }
      });
    }
    
    return promise;
  }
  
  function validateProjectName(projectName) {
    // Validate file name
    // Checks for valid Windows filenames:
    // See http://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx
    var _illegalFilenamesRegEx = /^(\.+|com[1-9]|lpt[1-9]|nul|con|prn|aux)$/i;
    if ((projectName.search(/[\/?*:;\{\}<>\\|]+/) !== -1) || projectName.match(_illegalFilenamesRegEx)) {
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            ExtensionStrings.INVALID_PROJECT_NAME,
            ExtensionStrings.INVALID_NAME_FORMAT
        );
        return false;
    }
    return true;
  }
  
  function createProjectFolder(rootPath, projectName) {
    var promise = new $.Deferred();
    if (!projectName) {
      promise.resolve(
        FileUtils.convertWindowsPathToUnixPath(rootPath)
      );
    } else {
      var projectFolderPath = FileUtils.convertWindowsPathToUnixPath(rootPath + '/' + projectName);
      var projectFolder = FileSystem.getDirectoryForPath(projectFolderPath);
      projectFolder.exists(function (err, exists) {
        if (err || exists) {
          promise.reject(Strings.FILE_EXISTS_ERR);
        } else {
          projectFolder.create(function (err, stat) {
            if (err) {
              promise.reject(err);
            } else {
              promise.resolve(projectFolderPath);
            }
          });
        }
        
      });
    }
    return promise;
  }
  
  function showErrorDialog(err) {
    Dialogs.showModalDialog(
      DefaultDialogs.DIALOG_ID_ERROR, 
      ExtensionStrings.DIALOG_TITLE_ERROR,
      err);
  }
  
  function openProject(projectPath, notify) {
    ProjectManager.openProject(projectPath).done(function () {
      if (notify) {
        Dialogs.showModalDialog(
        DefaultDialogs.DIALOG_ID_INFO, 
        ExtensionStrings.DIALOG_TITLE_INFO,
        ExtensionStrings.PROJECT_GENERATED_MESSAGE);  
      }      
    });
  }
  
  function createNewProject() {
    var projectRoot = ProjectManager.getProjectRoot();
    var context = {
      Strings: Strings,
      ExtensionStrings: ExtensionStrings,
      currentFolder: FileUtils.stripTrailingSlash(projectRoot.fullPath),
      templates: getProjectTemplates()
    };
    
    var dialog = Dialogs.showModalDialogUsingTemplate(
      Mustache.render(NewProjectDialogTemplate, context)
    );
    
    var $dlg = dialog.getElement(),
        $projectTemplate = $('.project-template', $dlg),
        $projectName = $('.project-name', $dlg),
        $changeFolderBtn = $('.change-folder-btn', $dlg),
        $projectFolder = $('.project-folder', $dlg),
        $OkBtn = $dlg.find(".dialog-button[data-button-id='ok']");
    
    var getSelectedTemplate = function () {
      var index = $projectTemplate[0].selectedIndex,
          $el = $projectTemplate.children("option").eq(index),
          p = $el ? $el.attr("package") || "" : "";
      return p;
    };
    
    dialog.done(function (buttonId) {
      if (buttonId === 'ok') {
        
        var targetFolder = $projectFolder.val(),
            projectName = $projectName.val(),
            templatePackage = getSelectedTemplate();
        
        createProjectFolder(targetFolder, projectName)
          .fail(showErrorDialog)
          .done(function (projectPath) {
            if (templatePackage) {
              generateProject(projectPath, templatePackage)
                .fail(showErrorDialog)
                .done(function () {
                  openProject(projectPath, true);
                });
            } else if (projectName) {
              openProject(projectPath, true);
            }
          });        
      }
    });
    
    $changeFolderBtn.click(function (e) {
      FileSystem.showOpenDialog(false, true, Strings.CHOOSE_FOLDER, projectRoot.fullPath, null,
        function (error, files) {
          if (!error && files && files.length > 0 && files[0].length > 0) {
            $projectFolder.val(
              FileUtils.convertWindowsPathToUnixPath(files[0])
            );
          }
        });

        e.preventDefault();
        e.stopPropagation();
    });
    
    $OkBtn.click(function (e) {
      if (!validateProjectName($projectName.val())) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }
  
  function getProjectTemplates() {
    var json = require('text!templates/templates.json'),
        settings = JSON.parse(json),
        result = [];
    for (var key in settings) {
      var entry = settings[key];
      result.push({ id: key, package: entry.package, name: entry.name });
    }
    return result;
  }
  
  function setupMenu() {
    var MENU_ID = 'dvuyka.templates.new';
    var fileMenu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
    CommandManager.register(ExtensionStrings.NEW_PROJECT_MENU, MENU_ID, createNewProject);
    fileMenu.addMenuItem(MENU_ID, undefined, Menus.AFTER, Commands.FILE_NEW_UNTITLED);
  }
  
  function init() {
    setupMenu();
    ExtensionUtils.loadStyleSheet(module, "styles/styles.css");
  }
  
  init();
});