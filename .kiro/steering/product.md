# Runway Watcher — Product Overview

Runway Watcher is an airport runway hazard detection and monitoring system. It provides a real-time dashboard for tracking hazards (birds, drones, debris, vehicles) detected by cameras positioned around an airport.

Key capabilities:
- Live interactive map with pannable/zoomable airport apron view, camera markers with real-time alert status indicators
- Camera feed management with live images from S3 (presigned URLs), auto-refresh every 30s, and full-screen overlay view
- Alert system driven by DynamoDB data — camera markers change color/icon based on alert level (normal/warning/alert)
- Static alert sidebar with dummy critical/high/info alerts (not yet wired to backend)
- Camera overview page with grid layout, status badges (recording/online/offline/maintenance), and image age display
- Two navigation views: Live Map and Cameras

Architecture:
- Camera images are uploaded to S3 on a 1-minute schedule by a Lambda function (with configurable per-camera upload probability)
- S3 object creation events (via EventBridge) trigger a processing Lambda that writes latest-image metadata to DynamoDB
- API Gateway exposes GET /cameras/latest (presigned image URLs) and GET /cameras/alerts (alert data from DynamoDB)
- Frontend fetches live camera feeds and alerts from the API, with polling intervals (30s for feeds, 15s for alerts)

Current state:
- Frontend is a working React SPA connected to the live backend API
- Backend has four Lambda handlers implemented: upload-images, process-image, get-latest-images, get-alerts
- Alert creation/detection logic is not yet implemented — the get-alerts endpoint reads from DynamoDB but nothing writes alert records yet
- The static dummy alerts in the right sidebar are hardcoded in App.tsx and not connected to the API
