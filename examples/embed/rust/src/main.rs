//! embed in Rust. See ../README.md for the algorithm.
//!
//! One Arrow record batch in on stdin, one out on stdout.

use std::io;
use std::process;
use std::sync::Arc;

use arrow::array::{Array, ArrayRef, FixedSizeListArray, Float64Array, StringArray, UInt32Array};
use arrow::datatypes::{DataType, Field, Schema};
use arrow::ipc::reader::StreamReader;
use arrow::ipc::writer::StreamWriter;
use arrow::record_batch::RecordBatch;

const DIMENSIONS: usize = 64;
const MODEL: &str = "hash-trigram-64-v1";

fn output_schema() -> Arc<Schema> {
    Arc::new(Schema::new(vec![
        Field::new("id", DataType::Utf8, false),
        Field::new("cleaned_text", DataType::Utf8, false),
        Field::new("token_count", DataType::UInt32, false),
        Field::new(
            "embedding",
            DataType::FixedSizeList(
                Arc::new(Field::new("item", DataType::Float64, false)),
                DIMENSIONS as i32,
            ),
            false,
        ),
        Field::new("model", DataType::Utf8, false),
    ]))
}

fn is_space(c: u8) -> bool {
    matches!(c, b' ' | b'\t' | b'\n' | b'\r' | 0x0c | 0x0b)
}

fn clean(text: &str) -> String {
    let mut out: Vec<u8> = Vec::with_capacity(text.len());
    let mut pending_space = false;
    for &c in text.as_bytes() {
        if is_space(c) {
            pending_space = true;
        } else if c < 0x20 || c == 0x7f {
            // control character: dropped
        } else {
            if pending_space && !out.is_empty() {
                out.push(b' ');
            }
            pending_space = false;
            out.push(if c.is_ascii_uppercase() { c + 0x20 } else { c });
        }
    }
    // Only ASCII bytes were touched, so the result is still valid UTF-8.
    String::from_utf8(out).expect("cleaning preserves UTF-8")
}

fn fnv1a(bytes: &[u8]) -> u32 {
    let mut h: u32 = 2166136261;
    for &b in bytes {
        h ^= u32::from(b);
        h = h.wrapping_mul(16777619);
    }
    h
}

fn embed(tokens: &[&str], into: &mut [f64]) {
    for token in tokens {
        let padded = format!("<{token}>");
        for window in padded.as_bytes().windows(3) {
            let h = fnv1a(window);
            into[(h as usize) % DIMENSIONS] += if h & 0x8000_0000 == 0 { 1.0 } else { -1.0 };
        }
    }
    let norm = into.iter().map(|x| x * x).sum::<f64>().sqrt();
    if norm > 0.0 {
        for x in into.iter_mut() {
            *x /= norm;
        }
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut reader = StreamReader::try_new(io::stdin().lock(), None)?;
    let input = reader.next().ok_or("input holds no record batch")??;
    let ids = input
        .column(0)
        .as_any()
        .downcast_ref::<StringArray>()
        .ok_or("column id is not utf8")?;
    let texts = input
        .column(1)
        .as_any()
        .downcast_ref::<StringArray>()
        .ok_or("column text is not utf8")?;

    let n = input.num_rows();
    let mut cleaned: Vec<String> = Vec::with_capacity(n);
    let mut counts: Vec<u32> = Vec::with_capacity(n);
    let mut embeddings = vec![0.0f64; n * DIMENSIONS];
    for i in 0..n {
        let text = if texts.is_null(i) { "" } else { texts.value(i) };
        let c = clean(text);
        let tokens: Vec<&str> = if c.is_empty() { Vec::new() } else { c.split(' ').collect() };
        counts.push(tokens.len() as u32);
        embed(&tokens, &mut embeddings[i * DIMENSIONS..(i + 1) * DIMENSIONS]);
        cleaned.push(c);
    }

    let schema = output_schema();
    let embedding_field = Arc::new(Field::new("item", DataType::Float64, false));
    let columns: Vec<ArrayRef> = vec![
        Arc::new(StringArray::from_iter_values(ids.iter().map(|v| v.unwrap_or("")))),
        Arc::new(StringArray::from(cleaned)),
        Arc::new(UInt32Array::from(counts)),
        Arc::new(FixedSizeListArray::try_new(
            embedding_field,
            DIMENSIONS as i32,
            Arc::new(Float64Array::from(embeddings)),
            None,
        )?),
        Arc::new(StringArray::from(vec![MODEL; n])),
    ];
    let output = RecordBatch::try_new(schema.clone(), columns)?;

    let mut writer = StreamWriter::try_new(io::stdout().lock(), &schema)?;
    writer.write(&output)?;
    writer.finish()?;
    Ok(())
}

fn main() {
    if let Err(err) = run() {
        eprintln!("{err}");
        process::exit(1);
    }
}
