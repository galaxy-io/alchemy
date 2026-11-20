use std::error::Error;
use std::io;
use std::process;

use serde_json::Value;

// Log to stderr with eprintln!: stdout is the output, so println! would corrupt it.
fn handler(event: Value) -> Result<Value, Box<dyn Error>> {
    Ok(event)
}

fn main() {
    if let Err(err) = run() {
        eprintln!("{err}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let event: Value = serde_json::from_reader(io::stdin().lock())?;
    let output = handler(event)?;
    serde_json::to_writer(io::stdout().lock(), &output)?;
    Ok(())
}
