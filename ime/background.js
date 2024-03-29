// Copyright 2013 The ChromeOS IME Authors. All Rights Reserved.
// limitations under the License.
// See the License for the specific language governing permissions and
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// distributed under the License is distributed on an "AS-IS" BASIS,
// Unless required by applicable law or agreed to in writing, software
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// You may obtain a copy of the License at
// you may not use this file except in compliance with the License.
// Licensed under the Apache License, Version 2.0 (the "License");
//

/**
 * @fileoverview The background script for os decoder chrome os extension.
 */

goog.provide('goog.ime.chrome.os.Background');

goog.require('goog.ime.chrome.os.Controller');
goog.require('goog.ime.chrome.os.LocalStorageHandlerFactory');



/**
 * The background class implements the script for the background page of chrome
 * os extension for os input tools.
 *
 * @constructor
 */
goog.ime.chrome.os.Background = function() {
  /**
   * The controller for chrome os extension.
   *
   * @type {goog.ime.chrome.os.Controller}
   * @private
   */
  this.controller_ = new goog.ime.chrome.os.Controller();

  this.vk_enable = false;

  /**
   * The local storage handler.
   *
   * @type {goog.ime.chrome.os.LocalStorageHandlerFactory}
   * @private
   */
  this.localStorageHandlerFactory_ =
      new goog.ime.chrome.os.LocalStorageHandlerFactory();

  // Sets up a listener which talks to the option page.
  chrome.extension.onRequest.addListener(goog.bind(this.processRequest, this));

  this.init_();
};



async function setSchema() {
  while (true) {
    try {
      let response = await fetch(
        'http://127.0.0.1:12346/schema/current'
      );
      let text = await response.text();
      window.localStorage.setItem("schema", text);
      window.localStorage.setItem("schema_change", "true");
      break;
    } catch (e) {
      await new Promise(resolve => { setTimeout(resolve, 250)});
      console.log(e);
    }
  }
}

/**
 * Initializes the background scripts.
 *
 * @private
 */
goog.ime.chrome.os.Background.prototype.init_ = function() {
  console.log(">>>init");
  setSchema();
  this.updateSettingsFromLocalStorage_();
  var self = this;
  chrome.input.ime.onActivate.addListener(function(engineID) {
    console.log(">>>onActivate");
    self.controller_.activate(engineID);
  });

  chrome.input.ime.onDeactivated.addListener(function() {
    console.log(">>>onDeactivated");
    self.controller_.deactivate();
  });

  chrome.input.ime.onFocus.addListener(function(context) {
    console.log(">>>onFocus");
    self.controller_.register(context);
    if (window.localStorage.getItem("schema_change")) {
      // for double pinyin
      self.controller_.keyActionTable_ = self.controller_.getKeyActionTable();

      // reload web socket
      self.controller_.model.reloadWebSocket(true);

      window.localStorage.setItem("schema_change", "");
    } else {
      self.controller_.model.reloadWebSocket(false);
    }
  });

  chrome.input.ime.onBlur.addListener(function(contextID) {
    console.log(">>>onBlur");
    self.controller_.unregister();
  });

  // Since onReset evnet is implemented in M29, it needs to keep the backward
  // compatibility here.
  var onReset = chrome.input.ime['onReset'];
  if (onReset) {
    onReset['addListener'](function(engineID) {
      self.controller_.reset();
    });
  }

  chrome.input.ime.onKeyEvent.addListener(function(engine, keyEvent) {
    return self.controller_.handleEvent(keyEvent);
  });

  chrome.input.ime.onCandidateClicked.addListener(function(
      engineID, candidateID, button) {
        self.controller_.processNumberKey({'key': candidateID + 1});
      });

  chrome.input.ime.onMenuItemActivated.addListener(function(
      engineID, stateID) {
        self.controller_.switchInputToolState(stateID);
      });
  if (chrome.inputMethodPrivate) {
    console.log(">>>has chrome.inputMethodPrivate");
    if (chrome.inputMethodPrivate && chrome.inputMethodPrivate.startIme) {

      chrome.inputMethodPrivate.startIme();
    }
  } else {
    console.log("!!!no chrome.inputMethodPrivate");
  }

  if (chrome.virtualKeyboardPrivate) {
    console.log(">>>has chrome.virtualKeyboardPrivate");
    chrome.virtualKeyboardPrivate.onKeyboardClosed.addListener(function() {
      self.vk_enable = false;
    })
  } else {
    console.log("!!!no chrome.virtualKeyboardPrivate");
  }

};


/**
 * Updates settings from local storage.
 *
 * @param {string=} opt_inputToolCode the input tool code whose settings are
 *     updated. If it is undefined, updates all the settings.
 * @private
 */
goog.ime.chrome.os.Background.prototype.updateSettingsFromLocalStorage_ =
    function(opt_inputToolCode) {
  if (opt_inputToolCode) {
    var localStorageHandler = this.localStorageHandlerFactory_.
        getLocalStorageHandler(opt_inputToolCode);
    localStorageHandler.updateControllerSettings(this.controller_);
  } else {
    var localStorageHandlers = this.localStorageHandlerFactory_.
        getAllLocalStorageHandlers();
    for (var i = 0; i < localStorageHandlers.length; ++i) {
      localStorageHandlers[i].updateControllerSettings(this.controller_);
    }
  }
};


/**
 * Processes incoming requests from option page.
 *
 * @param {Object} request Request from option page.
 *     - update_setting - updates the settings from local storage.
 */
goog.ime.chrome.os.Background.prototype.processRequest = function(
    request) {
  if (request['update']) {
    this.updateSettingsFromLocalStorage_(request['update']);
  }
};


var imeBackground;

(function() {
  imeBackground = new goog.ime.chrome.os.Background();
}) ();
