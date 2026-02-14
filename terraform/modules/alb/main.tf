# alb/main.tf
resource "aws_lb" "novagram_alb" {
  name               = "${var.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = var.security_groups
  subnets            = var.subnets

  enable_deletion_protection = false
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.novagram_alb.arn
  port              = "80"
  protocol          = "HTTP"

  # Default action goes to frontend
  default_action {
    type             = "forward"
    target_group_arn = var.frontend_target_group_arn
  }
  depends_on = [aws_lb.novagram_alb]
}

# /api/* goes to backend
resource "aws_lb_listener_rule" "backend_rule" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = var.backend_target_group_arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}