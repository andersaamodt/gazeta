const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteThemePath = path.join(__dirname, '..', 'site', 'static', 'themes', 'lapidarist.css');
const buildThemePath = path.join(__dirname, '..', 'build', 'static', 'themes', 'lapidarist.css');
const themeCgiPath = path.join(__dirname, '..', 'cgi', 'blog-theme.css');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('lapidarist defines gold-fleck overlay token', () => {
  const css = read(siteThemePath);
  assert.match(css, /--button-primary-overlay\s*:/, 'missing --button-primary-overlay token');
  assert.match(css, /radial-gradient\(/, 'missing fleck radial gradients');
  assert.match(css, /--gold-leaf\s*:\s*#[0-9a-fA-F]{6}/, 'missing --gold-leaf color token');
});

test('lapidarist applies flecked active style to selected navbar item', () => {
  const css = read(siteThemePath);
  assert.match(
    css,
    /\.nav-center a\.active,\s*[\r\n]+\s*\.nav-username\.active\s*\{/,
    'missing active navbar selector'
  );
  assert.match(
    css,
    /background-image\s*:\s*[\r\n\s]*var\(--button-primary-overlay\),/,
    'active navbar does not use fleck overlay'
  );
});

test('build lapidarist theme matches source lapidarist theme', () => {
  const sourceCss = read(siteThemePath);
  const buildCss = read(buildThemePath);
  assert.equal(
    buildCss,
    sourceCss,
    'build/static/themes/lapidarist.css is out of sync with site/static/themes/lapidarist.css'
  );
});

test('theme CGI selects newest theme file across source/build copies', () => {
  const script = read(themeCgiPath);
  assert.match(
    script,
    /theme_file_source="\$blog_site_root\/site\/static\/themes\/\$\{theme\}\.css"/,
    'missing source theme path assignment'
  );
  assert.match(
    script,
    /theme_file_build="\$blog_site_root\/build\/static\/themes\/\$\{theme\}\.css"/,
    'missing build theme path assignment'
  );
  assert.match(
    script,
    /\[ "\$source_mtime" -ge "\$build_mtime" \]/,
    'missing newest-file mtime comparison'
  );
  assert.match(script, /theme_file_mtime\(\)/, 'missing mtime helper for file selection');
});
