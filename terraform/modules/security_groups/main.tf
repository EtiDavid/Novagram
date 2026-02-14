resource "aws_security_group" "alb_security_group" {
  name        = "${var.name}-alb-sg"
  description = "ALB SG: allow HTTP from internet"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.name}-alb-sg"
  }
  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}



resource "aws_security_group" "backend_security_group" {
  name        = "${var.name}-backend-sg"
  description = "Backend SG: allow only from ALB SG (port 5000)"
  vpc_id      = var.vpc_id
  tags = {
    Name = "${var.name}-backend-sg"
  }

  ingress {
    from_port       = 5000
    to_port         = 5000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_security_group.id]
  }

  egress {
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    cidr_blocks     = ["0.0.0.0/0"]


  }
}

resource "aws_security_group" "frontend_security_group" {
  name        = "${var.name}-frontend-sg"
  vpc_id      = var.vpc_id
  tags = {
    Name = "${var.name}-frontend-sg"
  }

  ingress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_security_group.id]
  }

  egress {
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    cidr_blocks     = ["0.0.0.0/0"]


  }
}



