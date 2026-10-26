import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { apiRequest } from '@/lib/api';
import Profile from '../app/(tabs)/profile';
import Settings from '../app/account-settings';
jest.mock('@expo/vector-icons',()=>({MaterialCommunityIcons:'MockIcon'}));
jest.mock('@/lib/auth',()=>({useAuth:()=>({token:'fixture-only',user:{id:'me',username:'alex',displayName:'Alex',email:'fictional@example.test'},logout:jest.fn()})}));
jest.mock('@/lib/api',()=>({apiRequest:jest.fn(),resolveMediaUrl:(url:string)=>url}));
jest.mock('@/components/PostMedia',()=>({PostMedia:()=>null}));
jest.mock('expo-router',()=>({
  router:{push:jest.fn(),replace:jest.fn()},Stack:{Screen:()=>null},Redirect:()=>null,
  useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback]),
}));
beforeEach(()=>{jest.mocked(apiRequest).mockImplementation(async(path:string)=>path.startsWith('/posts/')?{data:[]}:{_count:{posts:0,followers:2,following:3}} as any);});
test('own profile exposes social tabs and settings, without destructive account controls',async()=>{
  render(<Profile/>);
  await waitFor(()=>expect(screen.getByText('Make this space yours')).toBeTruthy());
  expect(screen.getByLabelText('Account settings')).toBeTruthy();
  expect(screen.getByText('Posts')).toBeTruthy();
  expect(screen.getByText('Reels')).toBeTruthy();
  expect(screen.queryByText('Delete account')).toBeNull();
  expect(screen.queryByText('Logout')).toBeNull();
  expect(screen.queryByText('fictional@example.test')).toBeNull();
});
test('opening delete action requires confirmation before making any request',()=>{
  const alert=jest.spyOn(Alert,'alert');
  render(<Settings/>);fireEvent.press(screen.getByText('Delete account'));
  expect(alert).toHaveBeenCalledWith('Delete Account',expect.any(String),expect.arrayContaining([expect.objectContaining({text:'Cancel'}),expect.objectContaining({text:'Delete Forever',style:'destructive'})]));
  expect(apiRequest).not.toHaveBeenCalled();
});
test('block action works from explicit input and remains a confirmation step',()=>{
  const alert=jest.spyOn(Alert,'alert');render(<Settings/>);
  fireEvent.changeText(screen.getByLabelText('Username to block'),'@friend');
  fireEvent.press(screen.getByText('Block account'));
  expect(alert).toHaveBeenCalledWith('Block @friend?',expect.any(String),expect.any(Array));
  expect(apiRequest).not.toHaveBeenCalled();
});
