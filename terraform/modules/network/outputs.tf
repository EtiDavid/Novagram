output "vpc_id" {
  value = aws_vpc.novagram_vpc.id
}

output "private_subnet_ids" {
  value = aws_subnet.novagram_private_subnet[*].id
}

output "public_subnet_ids" {
  value = aws_subnet.novagram_subnet[*].id
}

output "public_route_table_id" {
  value = aws_route_table.route_table.id
}

output "private_route_table_id" {
  value = aws_route_table.private.id
}

output "igw" {
  value = aws_internet_gateway.gw.id
}