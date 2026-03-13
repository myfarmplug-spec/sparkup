"use client";
import { ChakraProvider, Box, Heading, Text, VStack, Button, HStack, Avatar } from "@chakra-ui/react";

const ORANGE = "#E05A1C";
const BROWN = "#5C2D0E";

export default function IntroducePage() {
  const user = { name: "Your Name", coins: 10 };

  return (
    <ChakraProvider>
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" style={{ background: "#FDF4EE" }}>
        <VStack spacing={6} p={8} bg="white" rounded="2xl" shadow="xl" minW="350px" maxW="90vw">
          <Avatar name={user.name} size="xl" bg={ORANGE} color="white" />
          <Heading color={BROWN} size="md" textAlign="center">Karibu, {user.name}!</Heading>
          <Text fontSize="md" color="gray.600" textAlign="center" lineHeight="tall">
            You&apos;re now part of the create.africa family.<br />
            We see you. Now show Africa your spark!
          </Text>
          <HStack spacing={3} flexWrap="wrap" justify="center">
            <Button colorScheme="green" variant="outline" size="sm">💪 Encourage</Button>
            <Button variant="outline" borderColor={ORANGE} color={ORANGE} size="sm">👋 Say Hi</Button>
            <Button colorScheme="orange" variant="solid" size="sm">🔥 Keep Going</Button>
            <Button colorScheme="pink" variant="outline" size="sm">❤️ Love</Button>
          </HStack>
          <Text fontSize="sm" color="gray.500">
            Tokens: <b style={{ color: "#F5A623" }}>{user.coins}</b>
          </Text>
        </VStack>
      </Box>
    </ChakraProvider>
  );
}
