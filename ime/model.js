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
 * @fileoverview Model for os decoder chrome os extension.
 */
goog.provide('goog.ime.chrome.os.Model');

goog.require('goog.events.EventTarget');
goog.require('goog.ime.chrome.os.Candidate');
goog.require('goog.ime.chrome.os.ConfigFactory');
goog.require('goog.ime.chrome.os.EventType');
goog.require('goog.ime.chrome.os.Status');
goog.require('goog.ime.offline.Decoder');



/**
 * The model, which manages the state transfers and commits.
 *
 * @constructor
 * @extends {goog.events.EventTarget}
 */
goog.ime.chrome.os.Model = function() {
  goog.base(this);

  /**
   * The current candidates.
   *
   * @type {!Array.<!goog.ime.chrome.os.Candidate>}
   */
  this.candidates = [];

  /**
   * The segments.
   *
   * @type {Array.<string>}
   */
  this.segments = [];

  /**
   * The segments.
   *
   * @type {Array.<string>}
   */
  this.tokens = [];

  /**
   * The config factory
   *
   * @type {!goog.ime.chrome.os.ConfigFactory}
   * @protected
   */
  this.configFactory = goog.ime.chrome.os.ConfigFactory.getInstance();

  this.socketReady = false;

  this.initWebSocket();
};
goog.inherits(goog.ime.chrome.os.Model, goog.events.EventTarget);


/**
 * Native Client Module.
 *
 * @type {goog.ime.offline.Decoder}
 * @private
 */
goog.ime.chrome.os.Model.prototype.decoder_ = null;


/**
 * The status of the model.
 *
 * @type {goog.ime.chrome.os.Status}
 */
goog.ime.chrome.os.Model.prototype.status = goog.ime.chrome.os.Status.INIT;


/**
 * The uncoverted source.
 *
 * @type {string}
 */
goog.ime.chrome.os.Model.prototype.source = '';


/**
 * The cursor position in the segments.
 *
 * @type {number}
 */
goog.ime.chrome.os.Model.prototype.cursorPos = 0;


/**
 * The context, a.k.a. history text.
 *
 * @type {string}
 */
goog.ime.chrome.os.Model.prototype.context = '';


/**
 * The current index of highlighted candidate.
 *
 * @type {number}
 */
goog.ime.chrome.os.Model.prototype.highlightIndex = -1;


/**
 * The partial commit position.
 *
 * @type {number}
 */
goog.ime.chrome.os.Model.prototype.commitPos = 0;


/**
 * Whether the model should holds select status.
 *
 * @type {boolean}
 * @private
 */
goog.ime.chrome.os.Model.prototype.holdSelectStatus_ = false;


/**
 * Whether the model is ready.
 *
 * @type {boolean}
 */
goog.ime.chrome.os.Model.prototype.ready = false;


/**
 * Updates this.highlightIndex.
 *
 * @param {number} newHighlight The new highlight to update the model.
 * @protected
 */
goog.ime.chrome.os.Model.prototype.updateHighlight = function(newHighlight) {
  if (this.status != goog.ime.chrome.os.Status.SELECT) {
    return;
  }
  if (newHighlight < 0) {
    newHighlight = 0;
  }
  if (newHighlight >= this.candidates.length) {
    return;
  }

  this.highlightIndex = newHighlight;
  this.notifyUpdates();
};


/**
 * Moves the highlight index by the given step.
 *
 * @param {number} step The number of steps to move, it could be negative.
 */
goog.ime.chrome.os.Model.prototype.moveHighlight = async function(step) {
  if (this.status != goog.ime.chrome.os.Status.SELECT) {
    return;
  }
  this.updateHighlight(this.highlightIndex + step);
};


/**
 * Moves the current page index by the given step.
 *
 * @param {number} step The number of steps to move, it could be negative.
 */
goog.ime.chrome.os.Model.prototype.movePage = async function(step) {
  if (this.status != goog.ime.chrome.os.Status.SELECT) {
    return;
  }
  var pageSize = parseInt(window.localStorage.getItem("pageSize") || this.configFactory.getCurrentConfig().pageSize);
  this.updateHighlight((this.getPageIndex() + step) * pageSize);
};


/**
 * Gets the current page index.
 *
 * @return {number} The page index.
 */
goog.ime.chrome.os.Model.prototype.getPageIndex = function() {
  if (this.highlightIndex < 0 || this.candidates.length == 0) {
    return 0;
  }
  var pageSize = parseInt(window.localStorage.getItem("pageSize") || this.configFactory.getCurrentConfig().pageSize);
  let pageIndex = Math.floor(this.highlightIndex / pageSize);

  if (Math.floor(this.candidates.length / pageSize) - pageIndex <= 2) {
    this.fetchRimeMoreCandidates_();
  }
  return pageIndex;
};


/**
 * Moves the cursor to the left.
 */
goog.ime.chrome.os.Model.prototype.moveCursorLeft = async function() {
  if (this.status != goog.ime.chrome.os.Status.SELECT ||
      this.cursorPos <= 0) {
    return;
  }

  if (this.cursorPos == this.commitPos) {
    this.commitPos--;
    this.segments[this.commitPos] = this.tokens[this.commitPos];
  } else {
    this.cursorPos--;
  }

  this.source = this.segments.slice(this.commitPos, this.cursorPos).join('');
  this.highlightIndex = -1;
  this.dispatchEvent(goog.ime.chrome.os.EventType.MODELUPDATED);
  this.holdSelectStatus_ = true;
  if (this.source) {
    await this.fetchCandidates_();
  }
};


/**
 * Moves the cursor to the right.
 */
goog.ime.chrome.os.Model.prototype.moveCursorRight = async function() {
  if (this.status != goog.ime.chrome.os.Status.SELECT ||
      this.cursorPos >= this.segments.length) {
    return;
  }

  var segment = this.segments[this.cursorPos];
  var ch = segment.slice(0, 1);
  var suffix = segment.slice(1);
  if (suffix == '') {
    this.segments = this.segments.slice(0, this.cursorPos).concat(
        this.segments.slice(this.cursorPos + 1));
  } else {
    this.segments[this.cursorPos] = suffix;
  }
  this.source = this.source + ch;
  this.highlightIndex = -1;
  this.dispatchEvent(goog.ime.chrome.os.EventType.MODELUPDATED);
  this.holdSelectStatus_ = true;

  await this.fetchCandidates_();
};


/**
 * Notifies others about Model updated event.
 *
 * @param {boolean=} opt_commit True if the source should be committed.
 */
goog.ime.chrome.os.Model.prototype.notifyUpdates = function(opt_commit) {
  if (opt_commit) {
    this.dispatchEvent(goog.ime.chrome.os.EventType.COMMIT);
    this.clear();
  } else {
    this.dispatchEvent(goog.ime.chrome.os.EventType.MODELUPDATED);
  }
};


/**
 * Clears the model to its initial state.
 */
goog.ime.chrome.os.Model.prototype.clear = function() {
  console.log("clear");
  if (this.status != goog.ime.chrome.os.Status.INIT) {
    this.dispatchEvent(goog.ime.chrome.os.EventType.CLOSING);
  }
  if (this.decoder_) {
    this.decoder_.clear();
  }
  this.source = '';
  this.cursorPos = 0;
  this.commitPos = 0;
  this.segments = [];
  this.context = '';
  this.highlightIndex = -1;
  this.candidates = [];
  this.auxiliaryText = ''; 
  this.status = goog.ime.chrome.os.Status.INIT;
  this.holdSelectStatus_ = false;
};


/**
 * Aborts the model, the behavior may be overridden by sub-classes.
 */
goog.ime.chrome.os.Model.prototype.abort = function() {
  this.clear();
};


/**
 * Aborts the model, the behavior may be overridden by sub-classes.
 */
goog.ime.chrome.os.Model.prototype.reset = function() {
  this.clear();
  if (this.decoder_) {
    this.decoder_.persist();
    this.decoder_ = null;
  }
  this.ready = false;
};


/**
 * Enter the select status, and notify updates.
 */
goog.ime.chrome.os.Model.prototype.enterSelect = function() {
  this.enterSelectInternal();
  this.notifyUpdates();
};


/**
 * Enter the select status.
 *
 * @protected
 */
goog.ime.chrome.os.Model.prototype.enterSelectInternal = function() {
  this.status = goog.ime.chrome.os.Status.SELECT;
  this.highlightIndex = 0;
};


/**
 * Sets the input tool.
 *
 * @param {string} inputToolCode The input tool code.
 */
goog.ime.chrome.os.Model.prototype.setInputTool = function(inputToolCode) {
  this.clear();
  var config = this.configFactory.getCurrentConfig();
  this.ready = false;
  this.decoder_ = new goog.ime.offline.Decoder(
      inputToolCode,
      goog.bind(this.notifyDataReady_, this),
      config.fuzzyExpansions,
      config.enableUserDict);
};


/**
 * Sets the fuzzy expansions for a given input tool.
 *
 * @param {string} inputToolCode The input tool code.
 * @param {Array.<string>} enabledExpansions The enabled expansions.
 */
goog.ime.chrome.os.Model.prototype.setFuzzyExpansions = function(
    inputToolCode, enabledExpansions) {
  var config = this.configFactory.getConfig(inputToolCode);
  config.fuzzyExpansions = enabledExpansions;

  if (config == this.configFactory.getCurrentConfig()) {
    this.decoder_.updateFuzzyPairs(config.fuzzyExpansions);
  }
};


/**
 * Enables/Disables user dictionary for a given input tool.
 *
 * @param {string} inputToolCode The input tool code.
 * @param {boolean} enable True if user dictionary is enabled.
 */
goog.ime.chrome.os.Model.prototype.enableUserDict = function(
    inputToolCode, enable) {
  var config = this.configFactory.getConfig(inputToolCode);
  config.enableUserDict = true;

  if (config == this.configFactory.getCurrentConfig()) {
    this.decoder_.enableUserDict(enable);
  }
};


/**
 * Updates the source text at the current cursor by the given transform result.
 *
 * @param {string} text The text to append.
 */
goog.ime.chrome.os.Model.prototype.updateSource = async function(text) {
  // Check the max input length. If it's going to exceed the limit, do nothing.
  if (this.source.length + text.length >
      this.configFactory.getCurrentConfig().maxInputLen) {
    this.selectCandidate(undefined, '');
  }

  this.source += text;
  this.highlightIndex = -1;
  if (this.status == goog.ime.chrome.os.Status.INIT) {
    this.dispatchEvent(goog.ime.chrome.os.EventType.OPENING);
  }
  this.dispatchEvent(goog.ime.chrome.os.EventType.MODELUPDATED);
  if (this.status == goog.ime.chrome.os.Status.SELECT) {
    this.holdSelectStatus_ = true;
  }
  await this.fetchCandidates_();
};


/**
 * Processes revert, which is most likely caused by BACKSPACE.
 */
goog.ime.chrome.os.Model.prototype.revert = async function() {
  if (this.status != goog.ime.chrome.os.Status.FETCHING) {
    if (this.status == goog.ime.chrome.os.Status.SELECT) {
      this.holdSelectStatus_ = true;
    }

    var deletedChar = '';
    if (this.commitPos > 0) {
      for (var i = 0; i < this.commitPos; ++i) {
        this.segments[i] = this.tokens[i];
      }
      this.commitPos = 0;
    } else if (this.cursorPos > 0) {
      var segment = this.segments[this.cursorPos - 1];
      deletedChar = segment.slice(-1);
      segment = segment.slice(0, -1);
      if (segment) {
        this.segments[this.cursorPos - 1] = segment;
      } else {
        this.segments = this.segments.slice(0, this.cursorPos - 1).concat(
            this.segments.slice(this.cursorPos));
        this.cursorPos--;
      }
    }

    this.source = this.segments.slice(this.commitPos, this.cursorPos).join('');
    if (this.source == '') {
      this.notifyUpdates();
      this.clear();
    } else {
      this.notifyUpdates();
      if (deletedChar == '\'') {
        this.decoder_.clear();
      }
      await this.fetchCandidates_();
    }
  }
};

goog.ime.chrome.os.Model.prototype.RimeWebSocketURL = 'ws://127.0.0.1:12346';

goog.ime.chrome.os.Model.prototype.reportCandidates_ = async function(source, index, target) {
  this.socket.send(":"+index.toString());
}


/**
 * Processes the candidate select action.
 *
 * @param {number=} opt_index The candidate index of the user choice, if not
 *     specified, use the current select index. This index can be negative,
 *     which means to select the composing text instead of a candidate.
 * @param {string=} opt_commit The committed text if it causes a full commit.
 *     Or empty string if this is not a full commit.
 */
goog.ime.chrome.os.Model.prototype.selectCandidate = async function(
    opt_index, opt_commit) {

  
  if (window.imeBackground.vk_enable) {
    chrome.runtime.sendMessage({
      type: "candidates_back",
      msg: {source: '', candidates: []}
    })
  }  

  if (this.status == goog.ime.chrome.os.Status.FETCHING) {
    return;
  }
  this.status = goog.ime.chrome.os.Status.FETCHING;
  if (opt_index == -1) {
    // commits the current source text.
    this.notifyUpdates(true);
    this.clear();
    return;
  }

  var index = opt_index ? opt_index : this.highlightIndex;
  var candidate = this.candidates[index];

  if (!candidate) {
    this.notifyUpdates(true);
    this.clear();
    return;
  }

  this.reportCandidates_(this.source, index, this.candidates[index].target);

  var source = '';
  for (var i = 0; i < candidate.range; ++i) {
    source += this.segments[i + this.commitPos];
  }
  this.tokens[this.commitPos] = source;
  this.segments[this.commitPos] = candidate.target;
  this.commitPos++;
  this.segments = this.segments.slice(0, this.commitPos).concat(
      this.segments.slice(this.commitPos - 1 + candidate.range));

  if (this.commitPos == this.segments.length || opt_commit != undefined) {
    this.decoder_.addUserCommits(this.tokens.join(''), this.segments.join(''));
    this.notifyUpdates(true);
    this.clear();
    return;
  }

  this.highlightIndex = -1;
  this.source = this.segments.slice(this.commitPos, this.cursorPos).join('');
  this.decoder_.clear();
  await this.fetchCandidates_();
};

goog.ime.chrome.os.Model.prototype.firstCandidateLineBack = function (line) {
  this.auxiliaryText = '';

  parts = line.split('（')
  tokens = parts[0].split(" ");

  var committedSegments = this.segments.slice(0, this.commitPos);
  var prefixSegments = committedSegments.concat(tokens);
  var suffixSegments = this.segments.slice(this.cursorPos);
  this.source = tokens.join('');
  this.segments = prefixSegments.concat(suffixSegments);
  this.cursorPos = prefixSegments.length;
  if (parts.length > 1) {
      this.auxiliaryText = parts[1].split('）')[0];
      console.log("auxiliaryText", this.auxiliaryText);
  }

  this.status = goog.ime.chrome.os.Status.FETCHED;
  if (this.configFactory.getCurrentConfig().autoHighlight ||
      this.holdSelectStatus_) {
    this.enterSelectInternal();
  }
  this.notifyUpdates();

  // can not fetch by page in virtualkeyboard
  if (window.imeBackground.vk_enable) {
    for (let i = 0; i < 7; i++) {
      this.fetchRimeMoreCandidates_();
    }
  }
}

goog.ime.chrome.os.Model.prototype.reloadWebSocket = function(force) {
  if (!this.socketReady) {
    this.initWebSocket();
  } else if (force) {
    this.socket.close();
    this.initWebSocket();
  }
}


goog.ime.chrome.os.Model.prototype.initWebSocket = function() {
  console.log("initWebSocket");
  let self = this;
  this.socket = new WebSocket(this.RimeWebSocketURL, "candidate");
  this.socket.onopen = (e) => {console.log("socket open"); self.socketReady = true;};
  this.socket.onerror = (e) => {console.log("socket error", e); self.socketReady = false;};

  let that = this;
  this.socket.onclose = function(event) {
    if (event.wasClean) {
      console.log(`[close] Connection closed cleanly, code=${event.code} reason=${event.reason}`);
    } else {
      console.log('[close] Connection died');
    }
    self.socketReady = false;
  };

  this.socket.onmessage = function(event) {
    let lines = event.data.split("\n");
    let startIx = 0;
    // first line is tokens when retrieve candidates for first time
    if (that.candidates.length == 0) {
        startIx = 1;
    }

    // push candidates
    for (let i = startIx; i < lines.length; i++) {
      if (lines[i].length > 0) {
      that.candidates.push(
          new goog.ime.chrome.os.Candidate(
              lines[i].toString(), Number(lines[i].length)));
      }
    }

    // push candidates to virtual keyboard
    if (window.imeBackground.vk_enable) {
      let tmp = [];
      for (const [i, c] of that.candidates.entries()) {
        tmp.push({candidate: c.target, ix: i});
      }
      chrome.runtime.sendMessage({
        type: "candidates_back",
        msg: {source: that.source, candidates: tmp}
      });
    }

    // notifyUpdates when retrieve candidates for first time
    if (startIx == 1 && lines.length > 0) {
      that.firstCandidateLineBack(lines[0]);
    }

  }
}

goog.ime.chrome.os.Model.prototype.fetchRimeCandidates_ = async function(source) {
  this.socket.send(source.replaceAll("ü", "v"));
};

goog.ime.chrome.os.Model.prototype.fetchRimeMoreCandidates_ = async function(source) {
  this.socket.send("");
};

/**
 * Fetches candidates and composing text from decoder.
 *
 * @private
 */
goog.ime.chrome.os.Model.prototype.fetchCandidates_ = async function() {
  this.status = goog.ime.chrome.os.Status.FETCHING;

  this.candidates = [];
  this.fetchRimeCandidates_(this.source);

};


/**
 * Notifies that the model data is ready.
 *
 * @private
 */
goog.ime.chrome.os.Model.prototype.notifyDataReady_ = function() {
  this.ready = true;
};
