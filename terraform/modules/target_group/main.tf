resource "aws_lb_target_group" "novagram_tg" {
  name        = "${var.name}-${var.service_name}-lb-tg"
  port        = var.port
  protocol    = var.protocol
  target_type = "ip"
  vpc_id      = var.vpc_id
  health_check {
    path =  var.health_check
  }
}
