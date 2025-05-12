#!/bin/bash

# این اسکریپت برنامه را در حالت توسعه اجرا می‌کند
# و به شما اجازه می‌دهد به صورت دستی برنامه را دوباره راه‌اندازی کنید

echo "=== Pro Translator Development Mode ==="
echo "Press Ctrl+C to exit"
echo "Press 'r' then Enter to restart the application"
echo "Starting application..."

# تابع برای اجرای برنامه در پس زمینه
run_app() {
  npm run dev &
  APP_PID=$!
  echo "App running with PID: $APP_PID"
}

# اجرای اولیه برنامه
run_app

# حلقه برای دریافت ورودی کاربر
while true; do
  read -p "> " input
  
  if [ "$input" == "r" ]; then
    echo "Restarting application..."
    
    # کشتن برنامه فعلی
    if [ ! -z "$APP_PID" ]; then
      kill $APP_PID 2>/dev/null
      # منتظر بمانید تا برنامه کاملاً بسته شود
      sleep 1
    fi
    
    # اجرای مجدد برنامه
    run_app
  elif [ "$input" == "q" ]; then
    echo "Exiting..."
    
    # کشتن برنامه فعلی
    if [ ! -z "$APP_PID" ]; then
      kill $APP_PID 2>/dev/null
    fi
    
    break
  elif [ "$input" == "?" ] || [ "$input" == "help" ]; then
    echo "Commands:"
    echo "  r    - Restart the application"
    echo "  q    - Quit development mode"
    echo "  ?    - Show this help"
  fi
done

echo "Development session ended."
exit 0 