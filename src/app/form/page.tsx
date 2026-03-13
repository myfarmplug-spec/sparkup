"use client";
import { ChakraProvider, Box, Heading, Button, VStack, Input, Textarea } from "@chakra-ui/react";
import Link from "next/link";

const ORANGE = "#E05A1C";
const BROWN = "#5C2D0E";

export default function FormPage() {
  return (
    <ChakraProvider>
      <Box
        minH="100vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        style={{ background: "linear-gradient(to bottom right, #FDF4EE, #FFF8F0)" }}
      >
        <VStack spacing={6} p={8} bg="white" rounded="2xl" shadow="xl" minW="350px" maxW="90vw">
          <Box
            h="4px"
            rounded="full"
            w="full"
            style={{ background: "linear-gradient(to right, #276221, #E05A1C, #F5A623)" }}
          />
          <Heading color={BROWN} size="md" textAlign="center">Share Your Spark 🔥</Heading>
          <Input
            placeholder="Your Name"
            size="lg"
            border="2px solid"
            borderColor="orange.100"
            _focus={{ borderColor: ORANGE, boxShadow: "none" }}
            rounded="xl"
            bg="orange.50"
          />
          <Textarea
            placeholder="What's your spark? Tell Africa about yourself!"
            size="lg"
            minH="80px"
            border="2px solid"
            borderColor="orange.100"
            _focus={{ borderColor: ORANGE, boxShadow: "none" }}
            rounded="xl"
            bg="orange.50"
            resize="none"
          />
          <Link href="/introduce" passHref legacyBehavior>
            <Button
              w="full"
              size="lg"
              bg={ORANGE}
              color="white"
              fontWeight="900"
              rounded="xl"
              _hover={{ bg: "#c44d16" }}
            >
              Continue →
            </Button>
          </Link>
        </VStack>
      </Box>
    </ChakraProvider>
  );
}
