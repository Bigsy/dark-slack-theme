rm -rf ./release
mkdir release
zip -r ./release/darkslack.zip * -x release/\* -x package.sh
