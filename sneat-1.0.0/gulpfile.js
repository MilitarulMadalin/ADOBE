const path = require('path');

// Config
// -------------------------------------------------------------------------------

const resolveEnv = () => {
  const alias = { prod: 'production', production: 'production', dev: 'development', development: 'development' };
  const args = process.argv.slice(2);
  let name = process.env.NODE_ENV || 'development';
  const flag = args.find(arg => arg.startsWith('--env='));
  if (flag) name = flag.split('=')[1];
  else {
    const idx = args.indexOf('--env');
    if (idx !== -1 && args[idx + 1]) name = args[idx + 1];
  }
  const resolved = alias[name] || name;
  return { current: { name: resolved } };
};
const env = resolveEnv();
process.env.NODE_ENV = env.current.name;

let serverPath;
let templatePath;
let buildPath;
const conf = (() => {
  const _conf = require('./build-config');
  serverPath = _conf.base.serverPath;
  templatePath = _conf.base.buildTemplatePath;
  buildPath = _conf.base.buildPath;
  return require('deepmerge').all([{}, _conf.base || {}, _conf[process.env.NODE_ENV] || {}]);
})();

conf.distPath = path.resolve(__dirname, conf.distPath).replace(/\\/g, '/');

// Modules
// -------------------------------------------------------------------------------

const { parallel, series, watch } = require('gulp');
const del = require('del');
const colors = require('ansi-colors');
const browserSync = require('browser-sync').create();
colors.enabled = require('color-support').hasBasic;

// Utilities
// -------------------------------------------------------------------------------

function srcGlob(...src) {
  return src.concat(conf.exclude.map(d => `!${d}/**/*`));
}

// Tasks
// -------------------------------------------------------------------------------

const buildTasks = require('./tasks/build')(conf, srcGlob);
const prodTasks = require('./tasks/prod')(conf);

// Clean build directory
// -------------------------------------------------------------------------------

const cleanTask = function () {
  return del([conf.distPath, buildPath], {
    force: true
  });
};

// Watch
// -------------------------------------------------------------------------------
const watchTask = function () {
  watch(srcGlob('**/*.scss', '!fonts/**/*.scss'), buildTasks.css);
  watch(srcGlob('fonts/**/*.scss'), parallel(buildTasks.css, buildTasks.fonts));
  watch(srcGlob('**/*.@(js|es6)', '!*.js'), buildTasks.js);
  // watch(srcGlob('**/*.png', '**/*.gif', '**/*.jpg', '**/*.jpeg', '**/*.svg', '**/*.swf'), copyTasks.copyAssets)
};

// Serve
// -------------------------------------------------------------------------------
const serveTasks = function () {
  browserSync.init({
    // ? You can change server path variable from build-config.js file
    server: serverPath,
    notify: false
  });
  watch([
    // ? You can change add/remove files/folders watch paths in below array
    'html/**/*.html',
    'html-starter/**/*.html',
    'assets/vendor/css/*.css',
    'assets/vendor/css/rtl/*.css',
    'assets/css/*.css',
    'assets/js/*.js'
  ]).on('change', browserSync.reload);
};

const serveTask = parallel([serveTasks, watchTask]);

// Build (Dev & Prod)
// -------------------------------------------------------------------------------

const buildTask = conf.cleanDist
  ? series(cleanTask, env.current.name === 'production' ? [buildTasks.all, prodTasks.all] : buildTasks.all)
  : series(env.current.name === 'production' ? [buildTasks.all, prodTasks.all] : buildTasks.all);

// Exports
// -------------------------------------------------------------------------------
module.exports = {
  default: buildTask,
  build: buildTask,
  'build:js': buildTasks.js,
  'build:css': buildTasks.css,
  'build:fonts': buildTasks.fonts,
  'build:copy': parallel([buildTasks.copy]),
  watch: watchTask,
  serve: serveTask
};
