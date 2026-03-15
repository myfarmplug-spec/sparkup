"use client";

import {
  Box, Text, VStack, HStack, Grid, GridItem, Badge, Button,
  Flex, Heading, Divider, useToast, Spinner, Center,
} from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ORANGE = "#E05A1C";
const BROWN = "#5C2D0E";
const CREAM = "#FDF4EE";
const GOLD = "#F5A623";

interface AdminDashboardProps {
  onClose: () => void;
}

interface DashboardStats {
  totalUsers: number;
  totalSparks: number;
  totalReactions: number;
  activeConversations: number;
  pendingReports: number;
  todayUsers: number;
  todaySparks: number;
}

interface IncidentReport {
  id: number;
  reporter_username: string;
  reported_username: string;
  report_type: string;
  description: string;
  status: string;
  created_at: string;
}

export default function AdminDashboard({ onClose }: AdminDashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch users
      const { data: users } = await supabase.from("profiles").select("id, created_at");
      const totalUsers = users?.length || 0;
      const today = new Date().toISOString().split("T")[0];
      const todayUsers = users?.filter(u => u.created_at?.startsWith(today)).length || 0;

      // Fetch sparks
      const { data: sparks } = await supabase.from("sparks").select("id, reactions, created_at");
      const totalSparks = sparks?.length || 0;
      const todaySparks = sparks?.filter(s => s.created_at?.startsWith(today)).length || 0;
      const totalReactions = sparks?.reduce((sum, s) => {
        const reactions = s.reactions as Record<string, number>;
        return sum + Object.values(reactions).reduce((a, b) => a + b, 0);
      }, 0) || 0;

      // Fetch messages for active conversations
      const { data: messages } = await supabase.from("messages").select("from_username, to_username");
      const uniquePairs = new Set<string>();
      messages?.forEach(m => {
        const pair = [m.from_username, m.to_username].sort().join("-");
        uniquePairs.add(pair);
      });
      const activeConversations = uniquePairs.size;

      // Fetch incident reports
      const { data: incidentReports } = await supabase
        .from("incident_reports")
        .select("*")
        .order("created_at", { ascending: false });
      const pendingReports = incidentReports?.filter(r => r.status === "pending").length || 0;

      setStats({
        totalUsers,
        totalSparks,
        totalReactions,
        activeConversations,
        pendingReports,
        todayUsers,
        todaySparks,
      });

      setReports(incidentReports || []);
    } catch (error) {
      toast({
        title: "Failed to load dashboard data",
        description: String(error),
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    }
    setLoading(false);
  };

  const handleReportAction = async (reportId: number, action: "reviewed" | "resolved") => {
    try {
      await supabase.from("incident_reports").update({ status: action }).eq("id", reportId);
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: action } : r));
      toast({
        title: `Report ${action}`,
        status: "success",
        duration: 2000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: "Failed to update report",
        description: String(error),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  if (loading || !stats) {
    return (
      <Box minH="100vh" bg={CREAM} py={8}>
        <Center py={20}>
          <VStack spacing={4}>
            <Spinner color={ORANGE} size="xl" />
            <Text color="gray.500">Loading dashboard...</Text>
          </VStack>
        </Center>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg={CREAM} pb={12}>
      {/* Header */}
      <Box bg="white" borderBottom="1px solid" borderColor="orange.100" position="sticky" top={0} zIndex={10}>
        <Flex maxW="1400px" mx="auto" px={6} py={4} align="center" justify="space-between">
          <Box>
            <Heading size="lg" color={BROWN}>
              Admin Dashboard
            </Heading>
            <Text fontSize="sm" color="gray.500">
              Platform Overview & Moderation
            </Text>
          </Box>
          <Button
            variant="outline"
            borderColor={ORANGE}
            color={ORANGE}
            fontWeight="700"
            rounded="xl"
            _hover={{ bg: "orange.50" }}
            onClick={onClose}
          >
            Back to Feed
          </Button>
        </Flex>
      </Box>

      <Box maxW="1400px" mx="auto" px={6} py={6}>
        {/* Stats Overview */}
        <VStack spacing={6} align="stretch">
          <Box>
            <Text fontSize="xs" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="wide" mb={3}>
              Platform Statistics
            </Text>
            <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap={4}>
              {[
                { label: "Total Users", value: stats.totalUsers, today: stats.todayUsers, emoji: "👥", color: ORANGE },
                { label: "Total Sparks", value: stats.totalSparks, today: stats.todaySparks, emoji: "✨", color: GOLD },
                { label: "Total Reactions", value: stats.totalReactions, emoji: "💪", color: "#E67E22" },
                { label: "Active Chats", value: stats.activeConversations, emoji: "💬", color: "#3498DB" },
              ].map((stat) => (
                <Box
                  key={stat.label}
                  bg="white"
                  rounded="2xl"
                  p={5}
                  border="2px solid"
                  borderColor="orange.100"
                  shadow="sm"
                >
                  <HStack spacing={3} mb={2}>
                    <Text fontSize="28px">{stat.emoji}</Text>
                    <Box flex={1}>
                      <Text fontSize="xs" color="gray.500" fontWeight="600">
                        {stat.label}
                      </Text>
                      <Text fontSize="3xl" fontWeight="900" color={BROWN} lineHeight={1}>
                        {stat.value.toLocaleString()}
                      </Text>
                    </Box>
                  </HStack>
                  {stat.today !== undefined && stat.today > 0 && (
                    <Badge bg="green.50" color="green.600" fontSize="10px" fontWeight="700" px={2} py={0.5} rounded="full">
                      +{stat.today} today
                    </Badge>
                  )}
                </Box>
              ))}
            </Grid>
          </Box>

          {/* Incident Reports */}
          <Box>
            <Flex align="center" justify="space-between" mb={3}>
              <HStack spacing={2}>
                <Text fontSize="xs" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="wide">
                  Incident Reports
                </Text>
                {stats.pendingReports > 0 && (
                  <Badge bg={ORANGE} color="white" rounded="full" fontSize="10px" px={2}>
                    {stats.pendingReports} pending
                  </Badge>
                )}
              </HStack>
              <Button size="xs" variant="ghost" color={ORANGE} onClick={loadDashboardData}>
                Refresh
              </Button>
            </Flex>

            {reports.length === 0 ? (
              <Box bg="white" rounded="2xl" p={8} textAlign="center" border="1px solid" borderColor="orange.100">
                <Text fontSize="32px" mb={2}>
                  ✅
                </Text>
                <Text fontWeight="700" color={BROWN} mb={1}>
                  No reports
                </Text>
                <Text fontSize="sm" color="gray.500">
                  Your community is doing great!
                </Text>
              </Box>
            ) : (
              <VStack spacing={3} align="stretch">
                {reports.map((report) => {
                  const statusColor =
                    report.status === "pending"
                      ? "orange"
                      : report.status === "reviewed"
                      ? "blue"
                      : "green";
                  return (
                    <Box
                      key={report.id}
                      bg="white"
                      rounded="2xl"
                      p={5}
                      border="2px solid"
                      borderColor={report.status === "pending" ? "orange.200" : "orange.100"}
                      shadow="sm"
                    >
                      <Flex justify="space-between" align="start" mb={3}>
                        <HStack spacing={2}>
                          <Badge colorScheme={statusColor} fontSize="10px" px={2} py={0.5} rounded="full">
                            {report.status}
                          </Badge>
                          <Badge bg="gray.100" color="gray.600" fontSize="10px" px={2} py={0.5} rounded="full">
                            {report.report_type.replace("_", " ")}
                          </Badge>
                        </HStack>
                        <Text fontSize="10px" color="gray.400">
                          {new Date(report.created_at).toLocaleDateString()}
                        </Text>
                      </Flex>

                      <Box mb={3}>
                        <Text fontSize="xs" color="gray.500" mb={1}>
                          Reporter: <Text as="span" fontWeight="700" color={BROWN}>@{report.reporter_username}</Text>
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          Reported: <Text as="span" fontWeight="700" color="red.500">@{report.reported_username}</Text>
                        </Text>
                      </Box>

                      <Box bg="gray.50" rounded="xl" p={3} mb={3}>
                        <Text fontSize="sm" color="gray.700" lineHeight="tall">
                          {report.description}
                        </Text>
                      </Box>

                      {report.status === "pending" && (
                        <HStack spacing={2}>
                          <Button
                            size="sm"
                            colorScheme="blue"
                            rounded="xl"
                            onClick={() => handleReportAction(report.id, "reviewed")}
                          >
                            Mark Reviewed
                          </Button>
                          <Button
                            size="sm"
                            colorScheme="green"
                            rounded="xl"
                            onClick={() => handleReportAction(report.id, "resolved")}
                          >
                            Mark Resolved
                          </Button>
                        </HStack>
                      )}
                    </Box>
                  );
                })}
              </VStack>
            )}
          </Box>

          <Divider />

          {/* Quick Actions */}
          <Box>
            <Text fontSize="xs" fontWeight="800" color="gray.400" textTransform="uppercase" letterSpacing="wide" mb={3}>
              Quick Actions
            </Text>
            <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={3}>
              <Button
                size="lg"
                bg={ORANGE}
                color="white"
                fontWeight="800"
                rounded="xl"
                _hover={{ bg: "#c44d16" }}
                onClick={() =>
                  toast({
                    title: "Feature coming soon!",
                    description: "Export functionality will be available in the next update.",
                    status: "info",
                    duration: 3000,
                  })
                }
              >
                📊 Export Statistics
              </Button>
              <Button
                size="lg"
                variant="outline"
                borderColor={ORANGE}
                color={ORANGE}
                fontWeight="800"
                rounded="xl"
                _hover={{ bg: "orange.50" }}
                onClick={() =>
                  toast({
                    title: "Feature coming soon!",
                    description: "User management will be available in the next update.",
                    status: "info",
                    duration: 3000,
                  })
                }
              >
                👥 Manage Users
              </Button>
            </Grid>
          </Box>
        </VStack>
      </Box>
    </Box>
  );
}
