// Food Waste Redistribution Platform: MongoDB (second database paradigm).
// Runs once on an empty volume via docker-entrypoint-initdb.d.
// Holds semi-structured operational notes only. Relational data stays in MySQL;
// donationId / authorUserId are references into MySQL, never copies.

const dbName = process.env.MONGO_INITDB_DATABASE || 'food_redistribution_platform';
const db = db.getSiblingDB(dbName);

db.createCollection('donation_operational_notes', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['donationId', 'eventType', 'authorUserId', 'createdAt', 'note'],
      properties: {
        donationId: { bsonType: ['int', 'long'] },
        eventType: { enum: ['HANDLING_NOTE', 'PICKUP_NOTE', 'DELIVERY_NOTE'] },
        authorUserId: { bsonType: ['int', 'long'] },
        createdAt: { bsonType: 'date' },
        note: { bsonType: 'string', maxLength: 1000 },
        metadata: { bsonType: 'object' }, // shape varies by eventType
      },
    },
  },
});

const notes = db.donation_operational_notes;
notes.createIndex({ donationId: 1, createdAt: -1 });
notes.createIndex({ eventType: 1, createdAt: -1 });

const ago = (h) => new Date(Date.now() - h * 3600 * 1000);
notes.insertMany([
  { donationId: 10, eventType: 'HANDLING_NOTE', authorUserId: 2, createdAt: ago(72),
    note: 'Biryani portioned into 6 sealed trays.', metadata: { trayCount: 6, allergens: ['nuts'] } },
  { donationId: 10, eventType: 'PICKUP_NOTE', authorUserId: 10, createdAt: ago(69.5),
    note: 'Trays warm, packaging intact.', metadata: { containerCount: 6, temperatureObserved: 'WARM', handlingFlag: false } },
  { donationId: 10, eventType: 'DELIVERY_NOTE', authorUserId: 6, createdAt: ago(68.5),
    note: 'Received and served at dinner.', metadata: { servings: 90, accepted: true } },
  { donationId: 11, eventType: 'PICKUP_NOTE', authorUserId: 11, createdAt: ago(45.7),
    note: 'One bag torn, repacked.', metadata: { containerCount: 3, temperatureObserved: 'AMBIENT', handlingFlag: true } },
  { donationId: 12, eventType: 'PICKUP_NOTE', authorUserId: 10, createdAt: ago(46.3),
    note: 'Two containers needed extra support.', metadata: { containerCount: 4, temperatureObserved: 'WARM', handlingFlag: true } },
  { donationId: 12, eventType: 'DELIVERY_NOTE', authorUserId: 8, createdAt: ago(45),
    note: 'All containers returned to restaurant next day.', metadata: { servings: 120, accepted: true, returnContainers: true } },
  { donationId: 8, eventType: 'HANDLING_NOTE', authorUserId: 5, createdAt: ago(3),
    note: 'Curd must stay refrigerated.', metadata: { storage: 'FRIDGE', maxAmbientMinutes: 45 } },
  { donationId: 8, eventType: 'PICKUP_NOTE', authorUserId: 11, createdAt: ago(1.8),
    note: 'Ice packs added.', metadata: { containerCount: 5, temperatureObserved: 'COLD', handlingFlag: false } },
]);
