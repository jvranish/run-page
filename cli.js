#!/usr/bin/env node

/**
 * @typedef {Object} RunPageOptions
 * @property {string} url - The URL to load in the headless browser
 * @property {number} timeout - Timeout in milliseconds before failing
 * @property {RegExp} donePattern - Regex pattern to detect test completion
 * @property {boolean} color - Whether to enable colored output
 */

const puppeteer = require('puppeteer');
const pc = require('picocolors');

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_DONE_PATTERN = /^DONE:(\d+)$/;

/**
 * Parse command line arguments
 * @returns {RunPageOptions | null} Parsed options or null if help/version was shown
 */
function parseArgs() {
  const args = process.argv.slice(2);

  /** @type {Partial<RunPageOptions>} */
  const options = {
    timeout: DEFAULT_TIMEOUT,
    donePattern: DEFAULT_DONE_PATTERN,
    color: shouldUseColor(),
  };

  let url = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      showHelp();
      return null;
    }

    if (arg === '-v' || arg === '--version') {
      showVersion();
      return null;
    }

    if (arg === '--no-color') {
      options.color = false;
      continue;
    }

    if (arg === '-t' || arg === '--timeout') {
      const value = args[++i];
      if (!value || isNaN(value)) {
        console.error('Error: --timeout requires a numeric value in milliseconds');
        process.exit(1);
      }
      options.timeout = parseInt(value, 10);
      continue;
    }

    if (arg === '-p' || arg === '--done-pattern') {
      const value = args[++i];
      if (!value) {
        console.error('Error: --done-pattern requires a regex pattern');
        process.exit(1);
      }
      try {
        options.donePattern = new RegExp(value);
      } catch (err) {
        console.error(`Error: Invalid regex pattern: ${err.message}`);
        process.exit(1);
      }
      continue;
    }

    if (arg.startsWith('-')) {
      console.error(`Error: Unknown option: ${arg}`);
      console.error('Run with --help for usage information');
      process.exit(1);
    }

    if (!url) {
      url = arg;
    } else {
      console.error('Error: Multiple URLs provided. Only one URL is allowed.');
      process.exit(1);
    }
  }

  if (!url) {
    console.error('Error: URL is required');
    console.error('Usage: run-page <url> [options]');
    console.error('Run with --help for more information');
    process.exit(1);
  }

  options.url = url;
  return /** @type {RunPageOptions} */ (options);
}

/**
 * Determine if colored output should be used
 * @returns {boolean}
 */
function shouldUseColor() {
  // Respect NO_COLOR environment variable
  if ('NO_COLOR' in process.env) {
    return false;
  }

  // Respect FORCE_COLOR environment variable
  if ('FORCE_COLOR' in process.env) {
    return true;
  }

  // Auto-detect TTY
  return process.stdout.isTTY;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
run-page - Run a web page in headless Chrome and capture console output

Usage:
  run-page <url> [options]

Options:
  -t, --timeout <ms>        Timeout in milliseconds (default: 30000)
  -p, --done-pattern <regex> Regex pattern to detect completion (default: "^DONE:(\\\\d+)$")
  --no-color                Disable colored output
  -h, --help                Show this help message
  -v, --version             Show version number

Examples:
  run-page http://localhost:8080/test.html
  run-page test.html --timeout 60000
  run-page test.html --done-pattern "^TEST_COMPLETE:(\\\\d+)$"
  run-page test.html --no-color

Environment Variables:
  NO_COLOR                  Disable colored output
  FORCE_COLOR               Force colored output even if not a TTY

The page should signal completion by logging a message matching the done pattern.
The first capture group should contain the exit code (0 = success).

Example test page:
  console.log('✔ Test passed');
  console.log('✘ Test failed');
  console.log('DONE:0'); // Exit with code 0
  `.trim());
}

/**
 * Show version
 */
function showVersion() {
  const pkg = require('./package.json');
  console.log(pkg.version);
}

/**
 * Format console output with colors if enabled
 * @param {string} text - The text to format
 * @param {boolean} useColor - Whether to apply colors
 * @returns {string}
 */
function formatOutput(text, useColor) {
  if (!useColor) {
    return text;
  }

  // Green for check marks - only color the symbol
  if (/^[✔✓]/.test(text)) {
    return text.replace(/^([✔✓])/, pc.green('$1'));
  }

  // Red for X marks - only color the symbol
  if (/^[✘✗]/.test(text)) {
    return text.replace(/^([✘✗])/, pc.red('$1'));
  }

  return text;
}

/**
 * Convert URL to a valid format for Puppeteer
 * @param {string} url - The URL or file path
 * @returns {string} Valid URL for Puppeteer
 */
function normalizeUrl(url) {
  const fs = require('fs');
  const path = require('path');
  const { pathToFileURL } = require('url');

  // If it's already a valid URL (http:// or https:// or file://), return as-is
  if (/^(https?|file):\/\//i.test(url)) {
    return url;
  }

  // Otherwise, treat it as a file path
  const absolutePath = path.resolve(process.cwd(), url);

  // Check if file exists
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  // Convert to file:// URL using Node's built-in function (handles cross-platform)
  return pathToFileURL(absolutePath).href;
}

/**
 * Run the page and capture console output
 * @param {RunPageOptions} options
 * @returns {Promise<number>} Exit code
 */
async function runPage(options) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Normalize the URL
  const normalizedUrl = normalizeUrl(options.url);

  let exitCode = 1;
  let done = false;
  let resolveDone;
  const donePromise = new Promise(r => { resolveDone = r; });

  page.on('console', msg => {
    const text = msg.text();
    const match = text.match(options.donePattern);

    if (match) {
      // Extract exit code from first capture group
      const capturedCode = match[1];
      if (capturedCode !== undefined) {
        exitCode = parseInt(capturedCode, 10);
        if (isNaN(exitCode) || exitCode < 0 || exitCode > 255) {
          process.stderr.write(`Warning: Invalid exit code '${capturedCode}', using 1\n`);
          exitCode = 1;
        }
      }
      done = true;
      resolveDone();
    } else {
      // Format and output the message
      const formattedText = formatOutput(text, options.color);

      // Route to appropriate stream based on message type
      const type = msg.type();
      const out = type === 'error' || type === 'warning' ? process.stderr : process.stdout;
      out.write(formattedText + '\n');
    }
  });

  page.on('pageerror', err => {
    process.stderr.write(`Uncaught error: ${err.message}\n`);
    done = true;
    resolveDone();
  });

  try {
    await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded' });
  } catch (err) {
    process.stderr.write(`Failed to load URL: ${err.message}\n`);
    await browser.close();
    return 1;
  }

  await Promise.race([
    donePromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${options.timeout}ms`)), options.timeout)
    ),
  ]).catch(err => {
    process.stderr.write(`${err.message}\n`);
  });

  await browser.close();
  return exitCode;
}

// Main execution
(async () => {
  const options = parseArgs();

  if (!options) {
    // Help or version was shown
    process.exit(0);
  }

  const exitCode = await runPage(options);
  process.exit(exitCode);
})();
