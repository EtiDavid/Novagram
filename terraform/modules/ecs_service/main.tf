resource "aws_ecs_service" "ecs_service" {
  name            = "${var.name}-${var.task_name}-service"
  cluster         = var.cluster_id
  task_definition = var.task_definition_arn
  desired_count   = var.desired_count




  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 0
  }


  # capacity_provider_strategy {
  #   capacity_provider = "FARGATE_SPOT"
  #   weight            = 2
  #   base              = 0
  # }

  platform_version = "LATEST"

  network_configuration {
    assign_public_ip = true
    security_groups  = var.security_group_ids
    subnets          = var.subnet_ids
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "${var.name}-${var.task_name}-container"
    container_port   = var.container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }


  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200


  wait_for_steady_state = true

  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = {
    Name = "${var.name}-${var.task_name}-service"
  }
}