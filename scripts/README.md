# IRIS bulk import script

Python CLI to OCR and import a folder of card photos in bulk via Gemini Batch API.

## Setup

```bash
cd scripts/
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
```

## Usage

Mode 1 (OCR + write CSV):

```bash
python add_cards.py /path/to/photos/
```

Mode 2 (commit after CSV review):

```bash
python add_cards.py /path/to/photos/ --commit add_cards_results.csv
```

## Tests

```bash
pytest tests/
```
