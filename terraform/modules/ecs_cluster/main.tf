resource "aws_ecs_cluster" "novagram_ecs_cluster" {
  name = "${var.name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }


}