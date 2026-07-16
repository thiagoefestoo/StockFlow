@echo off
echo === StockFlow Local ===
IF NOT EXIST backend\.env copy backend\.env.local.example backend\.env
IF NOT EXIST frontend\.env copy frontend\.env.local.example frontend\.env

echo Instalando dependencias do backend...
cd backend
call npm install
cd ..

echo Instalando dependencias do frontend...
cd frontend
call npm install
cd ..

echo Abrindo backend e frontend...
start "StockFlow Backend" cmd /k "cd backend && npm start"
start "StockFlow Frontend" cmd /k "cd frontend && npm start"
echo Abra http://localhost:5173
pause
