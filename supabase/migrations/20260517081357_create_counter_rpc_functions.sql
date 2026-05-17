/*
  # Create RPC functions for safe counter operations

  1. New Functions
    - `increment_post_likes` - Atomically increment like_count on community_posts
    - `decrement_post_likes` - Atomically decrement like_count on community_posts
    - `increment_follower_count` - Atomically increment follower_count on profiles
    - `decrement_follower_count` - Atomically decrement follower_count on profiles
    - `increment_following_count` - Atomically increment following_count on profiles
    - `decrement_following_count` - Atomically decrement following_count on profiles

  2. Notes
    - These functions use atomic updates to avoid race conditions
    - Decrement functions ensure counts never go below 0
*/

CREATE OR REPLACE FUNCTION increment_post_likes(post_id_input uuid)
RETURNS void AS $$
BEGIN
  UPDATE community_posts
  SET like_count = like_count + 1
  WHERE id = post_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_post_likes(post_id_input uuid)
RETURNS void AS $$
BEGIN
  UPDATE community_posts
  SET like_count = GREATEST(like_count - 1, 0)
  WHERE id = post_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_follower_count(target_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET follower_count = follower_count + 1
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_follower_count(target_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET follower_count = GREATEST(follower_count - 1, 0)
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_following_count(target_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET following_count = following_count + 1
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_following_count(target_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET following_count = GREATEST(following_count - 1, 0)
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
