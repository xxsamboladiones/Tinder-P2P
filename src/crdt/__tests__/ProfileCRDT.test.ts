import { ProfileCRDT } from '../ProfileCRDT';

describe('ProfileCRDT', () => {
  let profile1: ProfileCRDT;
  let profile2: ProfileCRDT;

  beforeEach(() => {
    profile1 = new ProfileCRDT();
    profile2 = new ProfileCRDT();
  });

  test('should initialize with empty profile', () => {
    const profile = profile1.getProfile();
    expect(profile.name).toBe('');
    expect(profile.bio).toBe('');
    expect(profile.photos).toEqual([]);
    expect(profile.interests).toEqual([]);
  });

  test('should update name and sync between instances', () => {
    // Update name on first instance
    profile1.updateName('John Doe');
    
    // Sync to second instance
    const state = profile1.getState();
    profile2.merge(state);

    expect(profile2.getProfile().name).toBe('John Doe');
  });

  test('should handle concurrent updates with last-write-wins', () => {
    // Update name on first instance
    const time1 = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => time1);
    profile1.updateName('John');

    // Update name on second instance
    const time2 = time1 + 1000; // Later time
    jest.spyOn(Date, 'now').mockImplementation(() => time2);
    profile2.updateName('Jane');

    // Sync both ways
    const state1 = profile1.getState();
    const state2 = profile2.getState();
    
    profile1.merge(state2);
    profile2.merge(state1);

    // The later update should win
    expect(profile1.getProfile().name).toBe('Jane');
    expect(profile2.getProfile().name).toBe('Jane');
  });

  test('should handle adding and removing photos', () => {
    profile1.addPhoto('photo1.jpg');
    profile1.addPhoto('photo2.jpg');
    
    // Sync to second instance
    profile2.merge(profile1.getState());
    expect(profile2.getProfile().photos).toEqual(['photo1.jpg', 'photo2.jpg']);
    
    // Remove a photo
    profile2.removePhoto('photo1.jpg');
    
    // Sync back to first instance
    profile1.merge(profile2.getState());
    
    expect(profile1.getProfile().photos).toEqual(['photo2.jpg']);
  });

  test('should handle adding and removing interests', () => {
    profile1.addInterest('hiking');
    profile1.addInterest('reading');
    
    // Sync to second instance
    profile2.merge(profile1.getState());
    expect(profile2.getProfile().interests).toContain('hiking');
    expect(profile2.getProfile().interests).toContain('reading');
    
    // Remove an interest
    profile2.removeInterest('hiking');
    
    // Sync back to first instance
    profile1.merge(profile2.getState());
    
    expect(profile1.getProfile().interests).not.toContain('hiking');
    expect(profile1.getProfile().interests).toContain('reading');
  });

  test('should handle partial updates', () => {
    // Set up initial state
    profile1.updateName('John');
    profile1.updateBio('Software Developer');
    
    // Sync initial state to second instance
    profile2.merge(profile1.getState());
    
    // Make changes on both instances
    profile1.addInterest('hiking');
    profile2.addInterest('reading');
    
    // Get partial updates
    const stateVector1 = profile1.getStateVector();
    const stateVector2 = profile2.getStateVector();
    
    const update1 = profile1.getUpdates(stateVector2);
    const update2 = profile2.getUpdates(stateVector1);
    
    // Apply partial updates
    profile1.merge(update2);
    profile2.merge(update1);
    
    // Both instances should have both interests
    expect(profile1.getProfile().interests).toEqual(expect.arrayContaining(['hiking', 'reading']));
    expect(profile2.getProfile().interests).toEqual(expect.arrayContaining(['hiking', 'reading']));
  });
});
