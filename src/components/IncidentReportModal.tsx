"use client";

import {
  Modal, ModalOverlay, ModalContent, ModalBody, ModalCloseButton,
  VStack, Text, Button, Textarea, Select, Box, useToast, Heading,
} from "@chakra-ui/react";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ORANGE = "#E05A1C";
const BROWN = "#5C2D0E";

const REPORT_TYPES = [
  { value: "harassment", label: "Harassment or Bullying" },
  { value: "spam", label: "Spam or Unwanted Messages" },
  { value: "inappropriate_content", label: "Inappropriate Content" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Other" },
];

interface IncidentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reporterUsername: string;
  reportedUsername: string;
  chatContext?: string;
}

export default function IncidentReportModal({
  isOpen,
  onClose,
  reporterUsername,
  reportedUsername,
  chatContext = "",
}: IncidentReportModalProps) {
  const [reportType, setReportType] = useState("other");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast({
        title: "Description required",
        description: "Please describe what happened",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setSubmitting(true);
    try {
      await supabase.from("incident_reports").insert({
        reporter_username: reporterUsername,
        reported_username: reportedUsername,
        report_type: reportType,
        description: description.trim(),
        chat_context: chatContext,
        status: "pending",
      });

      toast({
        title: "Report submitted",
        description: "Thank you for helping keep our community safe. We'll review this shortly.",
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      setReportType("other");
      setDescription("");
      onClose();
    } catch (error) {
      toast({
        title: "Failed to submit report",
        description: String(error),
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    }
    setSubmitting(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(4px)" />
      <ModalContent mx={4} rounded="2xl" overflow="hidden">
        <Box h="4px" bg={ORANGE} />
        <ModalCloseButton color={BROWN} />
        <ModalBody py={6} px={6}>
          <VStack spacing={4} align="stretch">
            <Box>
              <Heading size="md" color={BROWN} mb={1}>
                Report an Incident
              </Heading>
              <Text fontSize="sm" color="gray.500">
                Reporting @{reportedUsername}
              </Text>
            </Box>

            <Box>
              <Text fontSize="xs" fontWeight="700" color={BROWN} mb={2} textTransform="uppercase" letterSpacing="wide">
                What happened?
              </Text>
              <Select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                border="2px solid"
                borderColor="orange.100"
                _focus={{ borderColor: ORANGE, boxShadow: "none" }}
                rounded="xl"
                bg="orange.50"
              >
                {REPORT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </Box>

            <Box>
              <Text fontSize="xs" fontWeight="700" color={BROWN} mb={2} textTransform="uppercase" letterSpacing="wide">
                Please describe the incident
              </Text>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what happened in detail..."
                rows={5}
                border="2px solid"
                borderColor="orange.100"
                _focus={{ borderColor: ORANGE, boxShadow: "none" }}
                rounded="xl"
                bg="orange.50"
                resize="none"
              />
            </Box>

            <Box bg="orange.50" rounded="xl" p={3} border="1px solid" borderColor="orange.100">
              <Text fontSize="xs" color="gray.600" lineHeight="tall">
                Your report will be reviewed by our team. We take all reports seriously and will take appropriate action to keep our community safe.
              </Text>
            </Box>

            <Button
              w="full"
              size="lg"
              bg={ORANGE}
              color="white"
              fontWeight="900"
              rounded="xl"
              _hover={{ bg: "#c44d16" }}
              onClick={handleSubmit}
              isLoading={submitting}
              loadingText="Submitting..."
            >
              Submit Report
            </Button>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
