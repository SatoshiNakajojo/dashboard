/**
 * Lecture d'une réponse Yahoo Finance — réexport.
 *
 * Le module vit sous `supabase/functions/_shared/` parce qu'il est partagé
 * avec la fonction Edge, et que c'est la convention Supabase pour ce cas. Une
 * copie dans chaque monde dériverait ; ce réexport garantit qu'un prix lu à
 * l'écran et un prix écrit en base sortent du même code.
 */

export * from '../../supabase/functions/_shared/yahooParse';
