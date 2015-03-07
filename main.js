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
      StringUtils = brackets.getModule('utils/StringUtils'),
      Strings = brackets.getModule('strings'),
      ExtensionStrings = require('strings');
  
  var NewProjectDialogTemplate = require("text!htmlContent/new-project-dialog.html");
  var ProjectProgressDialogTemplate = require("text!htmlContent/project-progress-dialog.html");
  var zipUtils = new NodeDomain("zipUtils", ExtensionUtils.getModulePath(module, "node/zipUtils"));
  
  function unpackTemplate (template, projectPath, callback) {
    zipUtils
      .exec("unpack", template, projectPath)
      .done(callback)
      .fail(callback);
  }
  
  // Validate file name
  // Checks for valid Windows filenames:
  // See http://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx
  function validateProjectName(projectName) {
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
    if (err) {
      Dialogs.showModalDialog(
        DefaultDialogs.DIALOG_ID_ERROR, 
        ExtensionStrings.DIALOG_TITLE_ERROR,
        err);
    }
  }
  
  function showInfoDialog(info) {
    if (info) {
      Dialogs.showModalDialog(
        DefaultDialogs.DIALOG_ID_INFO, 
        ExtensionStrings.DIALOG_TITLE_INFO,
        info);  
    }
  }
  
  function openProject(projectPath, notify) {
    ProjectManager.openProject(projectPath).done(function () {
      var readmePath = projectPath + '/' + 'readme.md';
      var readme = FileSystem.getFileForPath(readmePath);
      readme.exists(function (err, exists) {
        if (!err && exists) {
          CommandManager.execute(Commands.FILE_ADD_TO_WORKING_SET, { fullPath: readmePath });
        }
        if (notify) {
          showInfoDialog(ExtensionStrings.PROJECT_GENERATED_MESSAGE);
        }  
      });
    });
  }
  
  function generateProject(opts) {
    var context = {
      Strings: Strings,
      ExtensionStrings: ExtensionStrings,
      templateName: opts.name,
      templateVersion: opts.version
    };
    var dialog = Dialogs.showModalDialogUsingTemplate(
      Mustache.render(ProjectProgressDialogTemplate, context)
    );
    var $dlg = dialog.getElement(),
        $footer = $('.modal-footer', $dlg),
        $message = $('.dialog-message', $dlg);
    
    zipUtils.exec("download", opts.url, null)
      .done(function (f) {
        unpackTemplate(f.packagePath, opts.projectPath, function (err) {
          if (err) {
            $message.text(StringUtils.format(ExtensionStrings.ERROR_MESSAGE_FORMAT, err));
          } else {
            $message.text(ExtensionStrings.PROJECT_GENERATED_MESSAGE);
            openProject(opts.projectPath, false);
          }
        });
      })
      .fail(function (err) {
        $message.text(StringUtils.format(ExtensionStrings.ERROR_MESSAGE_FORMAT, err));
      })
      .always(function () {
        $footer.show();
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
        $spinner = $('.dialog-progress', $dlg),
        $projectTemplate = $('.project-template', $dlg),
        $projectVersion = $('.project-version', $dlg),
        $projectVersionContainer = $('.project-version-container', $dlg),
        $projectName = $('.project-name', $dlg),
        $changeFolderBtn = $('.change-folder-btn', $dlg),
        $projectFolder = $('.project-folder', $dlg),
        $OkBtn = $dlg.find(".dialog-button[data-button-id='ok']");
    
    var getSelectedTemplate = function () {
      var index = $projectTemplate[0].selectedIndex,
          $el = $projectTemplate.children("option").eq(index),
          name = ($el && $el.length === 1) ? $el[0].innerText || "" : "",
          repo = $el ? $el.attr("repo") || "" : "";
      return { "name": name, "repo": repo };
    };
    
    var getSelectedVersion = function () {
      var index = $projectVersion[0].selectedIndex,
          $el = $projectVersion.children("option").eq(index),
          url = $el ? $el.attr("url") || "" : "",
          name = ($el && $el.length === 1) ? $el[0].innerText || "" : "";
      return { "name": name, "url": url };
    };
    
    dialog.done(function (buttonId) {
      if (buttonId === 'ok') {
        
        var targetFolder = $projectFolder.val(),
            projectName = $projectName.val(),
            template = getSelectedTemplate(),
            version = getSelectedVersion();
        
        createProjectFolder(targetFolder, projectName)
          .fail(showErrorDialog)
          .done(function (projectPath) {
            if (version.url) {
              generateProject({
                "name": template.name,
                "version": version.name,
                "url": version.url,
                "projectPath": projectPath 
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
    
    $projectTemplate.change(function () {
      var tpl = getSelectedTemplate();
      if (tpl.repo) {
        $projectVersion.empty();
        $projectVersionContainer.hide();
        $spinner.show();
        
        getGitHubTags(tpl.repo).then(
          function (tags) {
            $spinner.hide();
            if (tags.length > 0) {
              $projectVersion.empty();
              tags.forEach(function (t, idx) {
                $projectVersion.append("<option id=\"" + idx.toString() + "\" url=\"" + t.zipball_url + "\">" + t.name + "</option>");
              });
              $projectVersionContainer.show();
            }            
          },
          function (err) {
            $spinner.hide();
            Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_ERROR, ExtensionStrings.DIALOG_TITLE_ERROR, err);  
          }
        );
      } else {
        $projectVersionContainer.hide();
        $spinner.hide();
      }
    });
    
    $OkBtn.click(function (e) {
      if (!validateProjectName($projectName.val())) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }
  
  function getProjectTemplates() {
    var json = require('text!templates.json'),
        settings = JSON.parse(json),
        result = [];
    for (var key in settings) {
      var entry = settings[key];
      result.push({ 
        id: key,
        name: entry.name,
        repo: entry.repo
      });
    }
    return result;
  }
  
  function setupMenu() {
    var MENU_ID = 'dvuyka.templates.new';
    var fileMenu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
    CommandManager.register(ExtensionStrings.NEW_PROJECT_MENU, MENU_ID, createNewProject);
    fileMenu.addMenuItem(MENU_ID, undefined, Menus.AFTER, Commands.FILE_NEW_UNTITLED);
  }
  
  // expects 'repo' details in the format <user>/<project>
  function getGitHubTags(repo) {
    var promise = new $.Deferred();
    
    if (repo) {
      var url = 'https://api.github.com/repos/' + repo + '/tags';
      $.get(url)
        .done(function (data) {
          promise.resolve(data || []);
        })
        .fail(function () {
          promise.reject('Error getting versions');  
        });
    } else {
      promise.reject('Error accessing repo');
    }
    
    return promise;
  }
  
  function init() {
    setupMenu();
    ExtensionUtils.loadStyleSheet(module, "styles/styles.css");
  }
  
  init();
});