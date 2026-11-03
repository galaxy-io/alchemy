use std::error::Error;
use std::io;
use std::process;

use arrow::ipc::reader::StreamReader;
use arrow::ipc::writer::StreamWriter;
use arrow::record_batch::RecordBatch;

fn handler(batch: RecordBatch) -> Result<RecordBatch, Box<dyn Error>> {
    Ok(batch)
}

fn main() {
    if let Err(err) = run() {
        eprintln!("{err}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let mut reader = StreamReader::try_new(io::stdin().lock(), None)?;
    let batch = reader.next().ok_or("input holds no record batch")??;
    let output = handler(batch)?;
    let mut writer = StreamWriter::try_new(io::stdout().lock(), &output.schema())?;
    writer.write(&output)?;
    writer.finish()?;
    Ok(())
}
