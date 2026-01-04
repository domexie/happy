import { withLayoutContext } from 'expo-router';
import {
    createStackNavigator,
    type StackNavigationOptions,
    type StackNavigationEventMap,
} from '@react-navigation/stack';
import type { ParamListBase, StackNavigationState } from '@react-navigation/native';

const JsStack = createStackNavigator();

// Create expo-router compatible Stack for web with JS-based animations
export const WebStack = withLayoutContext<
    StackNavigationOptions,
    typeof JsStack.Navigator,
    StackNavigationState<ParamListBase>,
    StackNavigationEventMap
>(JsStack.Navigator);
