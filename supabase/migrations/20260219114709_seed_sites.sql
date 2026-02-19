-- ClearSkies — Las Vegas demo sites
-- geotab_zone_id values are placeholders.
-- Replace with real Zone IDs from MyGeotab → Administration → Zones.

insert into sites (name, address, lat, lng, geotab_zone_id, active) values
  (
    'Summerlin West Tower',
    '1700 Pavilion Center Dr, Las Vegas, NV 89135',
    36.1527,
    -115.3280,
    'zone-placeholder-summerlin',
    true
  ),
  (
    'Downtown Convention Expansion',
    '900 Las Vegas Blvd N, Las Vegas, NV 89101',
    36.1762,
    -115.1402,
    'zone-placeholder-downtown',
    true
  ),
  (
    'Henderson Logistics Hub',
    '31 N Stephanie St, Henderson, NV 89014',
    36.0494,
    -115.0627,
    'zone-placeholder-henderson',
    true
  );
