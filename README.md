# run-page

Run a web page in headless Chrome and capture console output.

A minimal CLI tool for running web-based tests without a testing framework. Your tests live in the page itself - just use `console.log()` to report results.

## What is this?

This is a simple command-line utility that opens a URL in a headless browser and captures the console output. It's designed for automated testing with a specific philosophy: the test infrastructure shouldn't provide anything you can't get by manually opening the page in a browser.

Your tests are built directly into your HTML pages using standard `console.log()` for output. The results can be visible both on the page itself and in the console. This means you can run your tests from the command line for automation, or simply open the HTML file in a browser to see the same results.

Made by Claude, but I personally use it frequently.


## How It Works

1. **Opens the URL** in a headless Chrome browser
2. **Captures `console.log()` output** and prints it to your terminal
3. **Waits for completion signal** - a console message matching the done pattern
4. **Exits with the code** from the completion message

## Installation

```bash
npm install run-page
# or
npx run-page <url>
```

## Usage

```bash
run-page <url> [options]
```

### Arguments

- `<url>` - The URL to load (local file, localhost, or remote URL)

### Options

- `-t, --timeout <ms>` - Timeout in milliseconds (default: 30000)
- `-p, --done-pattern <regex>` - Regex pattern to detect completion (default: `^DONE:(\d+)$`)
- `--no-color` - Disable colored output
- `-h, --help` - Show help message
- `-v, --version` - Show version number

### Examples

```bash
# Basic usage
run-page http://localhost:8080/test.html

# Local file
run-page test.html

# Custom timeout (60 seconds)
run-page test.html --timeout 60000

# Custom completion pattern
run-page test.html --done-pattern "^TEST_COMPLETE:(\d+)$"

# Disable colors
run-page test.html --no-color
```

### Completion Pattern

By default, `run-page` waits for a console message matching:

```
DONE:<exit-code>
```

Where `<exit-code>` is a number (0 = success, non-zero = failure).

Examples:
- `console.log('DONE:0')` - Exit with code 0 (success)
- `console.log('DONE:1')` - Exit with code 1 (failure)
- `console.log('DONE:5')` - Exit with code 5

You can customize this pattern with `--done-pattern`.

### Exit Codes

- **0** - Tests passed (from `DONE:0`)
- **Non-zero** - Tests failed (from `DONE:<n>` where n > 0)
- **1** - Timeout, page error, or invalid arguments


## Console Message Types

Different console methods are handled differently:

- `console.log()` → stdout (with color formatting)
- `console.error()` → stderr
- `console.warn()` → stderr
- Uncaught errors → stderr with "Uncaught error:" prefix

## Example Test Patterns

### Simple Pass/Fail

```javascript
let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.log(`✘ ${name}: ${err.message}`);
    failures++;
  }
}

test('addition works', () => {
  if (1 + 1 !== 2) throw new Error('Math is broken');
});

test('arrays work', () => {
  if ([1, 2, 3].length !== 3) throw new Error('Arrays broken');
});

console.log(`DONE:${failures}`);
```
