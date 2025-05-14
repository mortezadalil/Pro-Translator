#!/bin/bash

# Dev Launcher Script for Pro Translator
# This script helps manage the development workflow for Pro Translator

# Check that electron is installed
if ! command -v electron &> /dev/null; then
    echo "Error: electron is not installed. Please install it with npm install -g electron"
    exit 1
fi

# Function to run the app in the background
run_app() {
    echo "Starting Pro Translator in development mode..."
    electron . --dev &
    APP_PID=$!
    echo "App started with PID $APP_PID"
}

# Loop to get user input
while true; do
    echo "===================="
    echo "Pro Translator Dev Launcher"
    echo "===================="
    echo "1. Start app"
    echo "2. Restart app"
    echo "3. Stop app"
    echo "4. Exit launcher"
    echo "===================="
    
    read -p "Enter your choice (1-4): " choice
    
    case $choice in
        1)
            if [ -n "$APP_PID" ] && ps -p $APP_PID > /dev/null; then
                echo "App is already running with PID $APP_PID"
            else
                run_app
            fi
            ;;
        2)
            if [ -n "$APP_PID" ]; then
                echo "Stopping the app..."
                kill -9 $APP_PID 2>/dev/null
                sleep 2
            fi
            run_app
            ;;
        3)
            if [ -n "$APP_PID" ]; then
                echo "Stopping the app..."
                kill -9 $APP_PID 2>/dev/null
                APP_PID=""
                echo "App stopped."
            else
                echo "No running app found."
            fi
            ;;
        4)
            if [ -n "$APP_PID" ]; then
                echo "Stopping the app..."
                kill -9 $APP_PID 2>/dev/null
            fi
            echo "Exiting launcher."
            exit 0
            ;;
        *)
            echo "Invalid option, please try again."
            ;;
    esac
done 