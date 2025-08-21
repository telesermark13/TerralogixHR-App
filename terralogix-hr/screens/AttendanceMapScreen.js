// screens/AttendanceMapScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from "react-native";
import MapView, { Marker } from "react-native-maps";

export default function AttendanceMapScreen({ route }) {
  const mapRef = useRef(null);
  const { checkins = [] } = route.params ?? {};
  const [mapType, setMapType] = useState("standard");

  // Normalize and filter valid coordinates
  const points = useMemo(() => {
    return (checkins || [])
      .map((r) => ({
        ...r,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
      }))
      .filter(
        (r) =>
          Number.isFinite(r.latitude) &&
          Math.abs(r.latitude) <= 90 &&
          Number.isFinite(r.longitude) &&
          Math.abs(r.longitude) <= 180
      );
  }, [checkins]);

  if (!points.length) {
    return (
      <View style={styles.centered}>
        <Text>No check-ins to display.</Text>
      </View>
    );
  }

  const initialRegion = {
    latitude: points[0]?.latitude ?? 7.0717,
    longitude: points[0]?.longitude ?? 125.6017,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  // Auto-fit to markers after mount & whenever points change
  useEffect(() => {
    if (!mapRef.current || points.length === 0) return;
    const coords = points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    const t = setTimeout(() => {
      try {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
          animated: true,
        });
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [points]);

  const handleFit = () => {
    if (!mapRef.current || points.length === 0) return;
    mapRef.current.fitToCoordinates(points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })), {
      edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
      animated: true,
    });
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled
        mapType={mapType}
      >
        {points.map((rec, idx) => (
          <Marker
            key={rec.id ?? `${rec.date}-${idx}`}
            coordinate={{ latitude: rec.latitude, longitude: rec.longitude }}
            title={rec.date || "Check-in"}
            description={`Time In: ${rec.time_in || "--"}${
              rec.time_out ? ` | Time Out: ${rec.time_out}` : ""
            }`}
            pinColor="#00BFFF"
          />
        ))}
      </MapView>

      {/* Floating controls */}
      <View style={styles.fabCol}>
        <TouchableOpacity style={styles.fab} onPress={handleFit}>
          <Text style={styles.fabText}>Fit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setMapType((t) => (t === "standard" ? "satellite" : "standard"))}
        >
          <Text style={styles.fabText}>{mapType === "standard" ? "Sat" : "Std"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: Dimensions.get("window").width, height: Dimensions.get("window").height },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  fabCol: {
    position: "absolute",
    right: 16,
    bottom: 32,
    gap: 12,
  },
  fab: {
    backgroundColor: "#111827",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    elevation: 3,
    alignItems: "center",
  },
  fabText: { color: "#fff", fontWeight: "700" },
});
