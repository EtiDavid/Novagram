data "aws_iam_policy_document" "task_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_role" {
  for_each = var.services
  name               = "${var.name}-${each.key}-task-role"
  assume_role_policy = data.aws_iam_policy_document.task_assume_role.json
}

locals {
  role_policy_attachments = merge([
    for service_name, service in var.services : {
      for idx, policy_arn in tolist(service.policy_arns) :
      "${service_name}-${idx}" => {
        service    = service_name
        policy_arn = policy_arn
      }
    }
  ]...)
}

resource "aws_iam_role_policy_attachment" "task_role_policies" {
  for_each = local.role_policy_attachments
  role       = aws_iam_role.task_role[each.value.service].name
  policy_arn = each.value.policy_arn
}






