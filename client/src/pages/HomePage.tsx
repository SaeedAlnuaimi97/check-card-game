import { Box, Heading, Text, VStack } from '@chakra-ui/react';

function HomePage() {
  return (
    <Box
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="gray.900"
      color="white"
    >
      <VStack spacing={4}>
        <Heading size="2xl">Check Card Game</Heading>
        <Text fontSize="lg" color="gray.400">
          A multiplayer card game for 4-6 players
        </Text>
      </VStack>
    </Box>
  );
}

export default HomePage;
