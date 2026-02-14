data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}
resource "aws_iam_role" "task_execution_role" {
  name = "${var.name}-task-execution-role"

  assume_role_policy = data.aws_iam_policy_document.assume_role.json

}

resource "aws_iam_role_policy_attachment" "task_execution_role_policy" {
  role       = aws_iam_role.task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "execution_role_secrets" {
  role       = aws_iam_role.task_execution_role.name
  policy_arn = var.secrets_policy_arn
}