const sharp = require('sharp'); sharp({create:{width:256,height:256,channels:4,background:{r:0,g:122,b:255,alpha:1}}}).png().toFile('build/icon.png',()=>console.log('Done'));
