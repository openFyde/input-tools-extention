google-input-tools
==================

Fix Build
```
npm i google-closure-compiler@20150901.0.0 google-closure-library@20150315.0.0
export CLOSURE_LIB=node_modules/google-closure-library
export CLOSURE_COMPILER=node_modules/google-closure-compiler/compiler.jar

cd chrome/os/ime/pinyin
make
make background_dbg # Building option_dbg debug mode remain unsolved
```