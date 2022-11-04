SHELL:=/bin/bash
PROJECT:=chromeos-pinyin
CLOSURE_LIB=node_modules/google-closure-library
CLOSURE_COMPILER=node_modules/google-closure-compiler/compiler.jar
CLOSURE_BUILDER:=$(CLOSURE_LIB)/closure/bin/build/closurebuilder.py


all: background

dir:
	@mkdir -p files

background: dir
	@$(CLOSURE_BUILDER) --root=$(CLOSURE_LIB) --root=ime/ \
		--namespace="goog.ime.chrome.os.Background" \
		--output_mode=compiled \
		--compiler_jar=$(CLOSURE_COMPILER) \
		--compiler_flags="--externs=ime/api_externs.js" \
		> files/cros_background.js

clean:
	@rm -r files/cros_background.js
