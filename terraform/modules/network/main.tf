resource "aws_vpc" "novagram_vpc" {
  cidr_block       = var.vpc_cidr
  enable_dns_hostnames = true

  tags = {
    Name = "${var.name}-vpc"
  }
}
data "aws_availability_zones" "available" {
  state = "available"
}
resource "aws_subnet" "novagram_subnet" {
  count = length(var.public_subnet_cidr)
  vpc_id     = aws_vpc.novagram_vpc.id
  cidr_block = var.public_subnet_cidr[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true


tags = {
    Name = "${var.name}-public_subnet-${count.index + 1}"
  }
}

resource "aws_subnet" "novagram_private_subnet" {
  count = length(var.private_subnet_cidr)
  vpc_id     = aws_vpc.novagram_vpc.id
  cidr_block = var.private_subnet_cidr[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = false


  tags = {
    Name = "${var.name}-private_subnet-${count.index + 1}"
  }
}
resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.novagram_vpc.id

  tags = {
    Name = "${var.name}-internet-gateway"
  }
}

resource "aws_route_table" "route_table" {
  vpc_id = aws_vpc.novagram_vpc.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw.id
  }
}

resource "aws_route_table_association" "novagram_rta" {
  count= length(var.public_subnet_cidr)
  subnet_id      = aws_subnet.novagram_subnet[count.index].id
  route_table_id = aws_route_table.route_table.id

}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.novagram_vpc.id


  tags = {
    Name = "${var.name}-private-rt"
  }
}

resource "aws_route_table_association" "private" {
  count          = length(var.private_subnet_cidr)
  subnet_id      = aws_subnet.novagram_private_subnet[count.index].id
  route_table_id = aws_route_table.private.id
}

