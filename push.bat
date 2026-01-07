@echo off
setlocal enabledelayedexpansion

:: Получаем дату в формате YYYY-MM-DD
for /f "tokens=1-3 delims=/" %%a in ('date /t') do (
    set month=%%a
    set day=%%b
    set year=%%c
)

:: Добавляем ведущие нули если нужно
if !month! lss 10 set month=0!month!
if !day! lss 10 set day=0!day!

set current_date=%year%-%month%-%day%

:: Git команды
git add .
git commit -m "Update: %current_date%"
git push origin main
echo Successfully pushed with date: %current_date%