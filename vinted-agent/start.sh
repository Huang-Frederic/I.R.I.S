#!/bin/bash
# Run this at Windows startup via Task Scheduler
cd "$(dirname "$0")"
source env/bin/activate
python main.py >> agent.log 2>&1
