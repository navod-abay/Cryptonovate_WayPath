# ==============================================================================
# Terraform Configuration: Production-Ready Free Tier EC2 Single-Node Deployment
# Architecture: 9-Container Microservices Monorepo on AWS t3.micro (Ubuntu 24.04 LTS)
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ------------------------------------------------------------------------------
# Variables
# ------------------------------------------------------------------------------
variable "aws_region" {
  description = "Target AWS Region (ap-south-1 or us-east-1 recommended for Free Tier)"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment identifier tag"
  type        = string
  default     = "production"
}

variable "instance_type" {
  description = "EC2 Instance type (Free Tier eligible: t3.micro / t2.micro)"
  type        = string
  default     = "t3.micro"
}

variable "admin_ssh_cidr" {
  description = "CIDR block permitted for SSH management (Replace YOUR_IP_ADDRESS with your public IP)"
  type        = string
  default     = "YOUR_IP_ADDRESS/32"
}

variable "key_pair_name" {
  description = "Name of existing EC2 Key Pair for SSH access (optional, leave empty if not using SSH key)"
  type        = string
  default     = ""
}

variable "github_repo_url" {
  description = "Public Git repository URL containing the docker-compose.yml and microservices"
  type        = string
  default     = "https://github.com/your-org/TeamName_SolutionName.git"
}

# ------------------------------------------------------------------------------
# Provider
# ------------------------------------------------------------------------------
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Cryptonovate-Delivery"
      ManagedBy   = "Terraform"
      Environment = var.environment
    }
  }
}

# ------------------------------------------------------------------------------
# Data Sources: Default VPC & Canonical Ubuntu 24.04 LTS AMI
# ------------------------------------------------------------------------------
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_ami" "ubuntu_24_04" {
  most_recent = true
  owners      = ["099720109477"] # Canonical official owner ID

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

# ------------------------------------------------------------------------------
# Security Group
# ------------------------------------------------------------------------------
resource "aws_security_group" "app_sg" {
  name        = "cryptonovate-microservices-sg-${var.environment}"
  description = "Inbound HTTP port 80 and restricted SSH port 22"
  vpc_id      = data.aws_vpc.default.id

  # Ingress: Public HTTP to NGINX Reverse Proxy
  ingress {
    description      = "HTTP public gateway entrypoint"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # Ingress: Restricted SSH access
  ingress {
    description = "Restricted administrative SSH access"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_ssh_cidr]
  }

  # Egress: Allow all outbound traffic (package downloads, image pulls, git clone)
  egress {
    description      = "Allow all outbound traffic"
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = {
    Name = "cryptonovate-microservices-sg"
  }
}

# ------------------------------------------------------------------------------
# EC2 Instance with 30 GB gp3 & user_data Bootstrap Script
# ------------------------------------------------------------------------------
resource "aws_instance" "app_server" {
  ami                         = data.aws_ami.ubuntu_24_04.id
  instance_type               = var.instance_type
  subnet_id                   = tolist(data.aws_subnets.default.ids)[0]
  vpc_security_group_ids      = [aws_security_group.app_sg.id]
  key_name                    = var.key_pair_name != "" ? var.key_pair_name : null
  associate_public_ip_address = true

  # AWS Free Tier Maximum Root Storage: 30 GB gp3
  root_block_device {
    volume_size           = 30
    volume_type           = "gp3"
    iops                  = 3000
    throughput            = 125
    delete_on_termination = true
    encrypted             = true

    tags = {
      Name = "cryptonovate-root-ebs"
    }
  }

  # ----------------------------------------------------------------------------
  # Critical user_data: 4GB Swap, Docker, Docker Compose, Git & Stack Bootstrap
  # ----------------------------------------------------------------------------
  user_data = <<-EOF
              #!/bin/bash
              set -euo pipefail

              exec > >(tee -a /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
              echo "=========================================================="
              echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Instance Initialization"
              echo "=========================================================="

              # ----------------------------------------------------------------
              # 1. PROVISION 4 GB SWAP FILE (CRITICAL FOR 1 GB RAM / OOM GUARD)
              # ----------------------------------------------------------------
              echo ">>> Provisioning 4 GB Swap space..."
              if [ ! -f /swapfile ]; then
                fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
                chmod 600 /swapfile
                mkswap /swapfile
                swapon /swapfile
                echo '/swapfile none swap sw 0 0' >> /etc/fstab

                # Tune kernel VM swappiness for low-memory Docker workloads
                sysctl vm.swappiness=10
                sysctl vm.vfs_cache_pressure=50
                echo 'vm.swappiness=10' >> /etc/sysctl.d/99-swap.conf
                echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.d/99-swap.conf
                echo ">>> Swap space provisioned successfully:"
                free -h
              fi

              # ----------------------------------------------------------------
              # 2. SYSTEM UPDATES & DOCKER PREREQUISITES
              # ----------------------------------------------------------------
              echo ">>> Updating system packages and installing prerequisites..."
              export DEBIAN_FRONTEND=noninteractive
              apt-get update -y
              apt-get install -y --no-install-recommends \
                ca-certificates \
                curl \
                gnupg \
                lsb-release \
                git \
                jq

              # ----------------------------------------------------------------
              # 3. INSTALL OFFICIAL DOCKER ENGINE & DOCKER COMPOSE PLUGIN
              # ----------------------------------------------------------------
              echo ">>> Configuring official Docker repository..."
              install -m 0755 -d /etc/apt/keyrings
              curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
              chmod a+r /etc/apt/keyrings/docker.asc

              echo \
                "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
                $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
                tee /etc/apt/sources.list.d/docker.list > /dev/null

              apt-get update -y
              apt-get install -y --no-install-recommends \
                docker-ce \
                docker-ce-cli \
                containerd.io \
                docker-buildx-plugin \
                docker-compose-plugin

              # Enable & start Docker service
              systemctl enable --now docker
              usermod -aG docker ubuntu

              echo ">>> Docker installed successfully:"
              docker --version
              docker compose version

              # ----------------------------------------------------------------
              # 4. CLONE MONOREPO & LAUNCH 9-CONTAINER STACK
              # ----------------------------------------------------------------
              APP_DIR="/home/ubuntu/app"
              REPO_URL="${var.github_repo_url}"

              echo ">>> Cloning repository from $REPO_URL..."
              rm -rf "$APP_DIR"
              git clone "$REPO_URL" "$APP_DIR"
              chown -R ubuntu:ubuntu "$APP_DIR"
              cd "$APP_DIR"

              # Prepare environment file
              if [ -f .env.example ]; then
                echo ">>> Copying .env.example to .env..."
                cp .env.example .env
              else
                echo ">>> Creating fallback .env..."
                touch .env
              fi

              # Fix permissions for ubuntu user
              chown -R ubuntu:ubuntu "$APP_DIR"

              echo ">>> Building and launching containers via Docker Compose..."
              # Running as ubuntu user to respect directory permissions
              sudo -u ubuntu docker compose up -d --build

              echo "=========================================================="
              echo "[$(date '+%Y-%m-%d %H:%M:%S')] All Services Deployed Successfully"
              echo "=========================================================="
              EOF

  tags = {
    Name = "cryptonovate-microservices-host"
  }
}

# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------
output "instance_id" {
  description = "EC2 Instance ID"
  value       = aws_instance.app_server.id
}

output "instance_public_ip" {
  description = "Public IPv4 address of the EC2 instance"
  value       = aws_instance.app_server.public_ip
}

output "application_url" {
  description = "Public HTTP URL to access the NGINX Gateway & Web App"
  value       = "http://${aws_instance.app_server.public_ip}"
}

output "ssh_connection_command" {
  description = "Command to SSH into the instance (requires matching private key and admin_ssh_cidr)"
  value       = var.key_pair_name != "" ? "ssh -i <path-to-${var.key_pair_name}.pem> ubuntu@${aws_instance.app_server.public_ip}" : "SSH Key not configured in variables"
}

output "bootstrap_log_command" {
  description = "Command to inspect user_data bootstrap execution logs"
  value       = "ssh ubuntu@${aws_instance.app_server.public_ip} 'sudo tail -f /var/log/user-data.log'"
}
