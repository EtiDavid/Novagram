output "alb_sg_id" {
  value = aws_security_group.alb_security_group.id
}

output "backend_sg_id" {
  value = aws_security_group.backend_security_group.id
}

output "frontend_sg_id" {
  value = aws_security_group.frontend_security_group.id
}