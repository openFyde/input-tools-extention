google-input-tools
==================

Fix Build
```
npm i google-closure-compiler@20170626.0.0 google-closure-library@20150315.0.0
export CLOSURE_LIB=`pwd`/node_modules/google-closure-library
export CLOSURE_COMPILER=`pwd`/node_modules/google-closure-compiler/compiler.jar

cd chrome/os/ime/pinyin
make
```