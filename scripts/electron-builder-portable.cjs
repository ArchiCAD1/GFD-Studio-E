const build = require('../package.json').build;

module.exports = {
  ...build,
  directories: { ...build.directories, output: 'release-portable' },
  artifactName: 'GFD-Studio-E-${version}-${os}-${arch}-portable.${ext}',
  win: { ...build.win, target: [{ target: 'portable', arch: ['x64'] }] }
};
