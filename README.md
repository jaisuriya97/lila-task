Deployment Guide

💻 Local Run

Update Config
Open frontend/src/App.jsx and set:

```
host: '127.0.0.1'
```

Build Backend

```
cd backend
npm install
npm run build
cd ..
```

Build Frontend
```
cd frontend
npm install
npm run build
cd ..
```

Start Server
```
docker-compose down -v
docker-compose up --build -d
```

Play
```
Open http://localhost in your browser.
```
☁️ AWS Deployment

1. Server Setup

Launch AWS EC2 (Ubuntu).

Open Inbound Ports: 22, 80, 7350, 7351 (Source: 0.0.0.0/0).

SSH into server (ssh -i key.pem ubuntu@YOUR_PUBLIC_IP) and run:
```
curl -fsSL [https://deb.nodesource.com/setup_20.x](https://deb.nodesource.com/setup_20.x) | sudo -E bash -
sudo apt-get install -y nodejs docker.io docker-compose
sudo usermod -aG docker $USER
newgrp docker
```

2. Update Config (Local Machine)

Open frontend/src/App.jsx and set:
```
host: 'YOUR_AWS_PUBLIC_IP'
```

3. Upload Code (Local Machine)

Run from your project root:
```
# Copy Backend
scp -i key.pem -r backend ubuntu@YOUR_PUBLIC_IP:/home/ubuntu/

# Copy Frontend
scp -i key.pem -r frontend ubuntu@YOUR_PUBLIC_IP:/home/ubuntu/

# Copy Docker Config
scp -i key.pem docker-compose.yml ubuntu@YOUR_PUBLIC_IP:/home/ubuntu/
```

4. Build & Run (Server)

SSH back into the server and run:
```
# Build Backend
cd backend
npm install
npm run build
cd ..

# Build Frontend
cd frontend
npm install
npm run build
cd ..

# Start Game
docker-compose down -v
docker-compose up --build -d
```

5. Play
```
Open http://YOUR_AWS_PUBLIC_IP in your browser.
```