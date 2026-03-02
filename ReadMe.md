# Novagram — Real-Time Chat Application


##  Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Infrastructure Setup](#infrastructure-setup)
- [CI/CD Pipeline](#cicd-pipeline)
- [Key Challenges & Solutions](#challenges)
- [Local Development](#local-dev)
- [Deployment Guide](#deployment)
- [Lessons Learned](#lessons)


Novagram is a real-time web chat application designed for devops end to end practice, deployed on AWS ECS Fargate with CI/CD automation and infrastructure-as-code via Terraform.

## Tech stack

**Frontend**: React single-page app served by Nginx

_**Backend**_: Node.js + Socket.IO(web-socket)

**_Database_**: MongoDB Atlas (managed DB)

**container image** - docker image

**Containerization**: docker

**Orchestration**: AWS ECS Fargate

**Networking**: one VPC + ALB (path-based routing)

**CI/CD**: GitHub Actions using OIDC(open id connect)

**Security**: IAM roles, Secrets Manager

**Image security**: Trivy scanning

**Infrastructure management**: Terraform 

## summary of the devops work done on this project
### Step 1—Architectural Planning
This step involved understanding the make of the project 

- ### Backend and frontend

    **What runs and starts the app ?**

      - The backend was built with Node.js and socket.io(for realtime communication)
      - The backent starts with Node app.js 
      - The frontend was built with react 
      - The frontend starts with npm run
     
    **What database is used and how does it connect**

        - The backend used mongoDB Atlas which is a self-managed database by mongodb
        - its connect to the mongodb via url which is injected via environment

    **Via what port does the backend and frontend connect to**

          - The backend uses port 5000
          - the frontend uses port 80
    **What environments exist and what separate each environment?**

          - for both backend and frontend uses 3 environment which are development, staging and production environment
          - each environment connects to different mongo database

    **What is the end point for the backend to know its healthy**

         -  for the backend the end point is /health at port 5000
         -  for the frontend the end point is / at port 80


### Step 2— Containerization 
Though the application could run on my pc after installing all packages and dependencies



















## **summary of version 1**
### backend
- user can create account
- user can join rooms
- Admin can reset user pin, delete user create new rooms
- online and typing indication

### frontend

- user inteface is very basic (white background)
- online and typing indicators are visible
